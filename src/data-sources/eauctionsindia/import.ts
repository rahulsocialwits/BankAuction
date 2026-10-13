import { prisma } from "@/lib/db/prisma";
import { importRecords, type ListingRecord } from "@/lib/import/csvImport";
import { fetchWithRetry, describeStatus, isRefusal } from "@/lib/fetch/httpStatus";
import { RobotsGate } from "@/data-sources/feeds/robotsGate";
import { UA } from "@/data-sources/feeds/webScan";
import type { SourceState } from "@/data-sources/authorized/engine";
import { EAUCTIONS_HOST, parseEauctionsPage } from "./parse";

/*
 * eAuctionsIndia category pages, read page by page. Switched on ONLY with a recorded permission:
 *     EAUCTIONS_AUTHORIZED=yes
 *     EAUCTIONS_AUTH_NOTE=<where the written permission is: sender, date, subject>     (required, at least 8 characters)
 * optional: EAUCTIONS_CATEGORIES (default "residential"; add slugs only after checking /category/<slug> exists),
 *           EAUCTIONS_DELAY_MS (default 1500, minimum 1000), EAUCTIONS_PAGES_PER_RUN (scheduler, default 20),
 *           EAUCTIONS_REFRESH_PAGES (pages re-read in each refresh pass, default 50), EAUCTIONS_MIN_INTERVAL_MIN (default 360).
 *
 * The site answers our crawler with a Cloudflare challenge today. A challenge / 401 / 403 / robots refusal stops the run as
 * "awaiting authorization" and is never retried or worked around: the operator must allow-list the user agent BankAuctionBot/1.0.
 * The first full pass is resumable (a cursor per category is saved after every page, a few pages per scheduler tick). After it, a
 * refresh pass re-reads the first pages every EAUCTIONS_MIN_INTERVAL_MIN: the list order (newest first or not) is NOT verified, so a
 * full pass is repeated with `--restart` when in doubt. Imports are idempotent (source id src:eauctionsindia.com:<id>).
 */

const BASE = "https://www.eauctionsindia.com";
const KEY = "eauctionsPages";

type Env = Record<string, string | undefined>;

export function pagesAuthorization(env: Env = process.env): { ok: true } | { ok: false; reason: string } {
  if (env.EAUCTIONS_AUTHORIZED?.trim() !== "yes") return { ok: false, reason: "No written permission is recorded (EAUCTIONS_AUTHORIZED is not \"yes\"). Nothing is requested from the site." };
  if ((env.EAUCTIONS_AUTH_NOTE ?? "").trim().length < 8) return { ok: false, reason: "EAUCTIONS_AUTH_NOTE is empty: write where the written permission is kept (sender, date, subject)." };
  return { ok: true };
}

interface CatCursor { page: number; lastPage: number | null; done: boolean; refresh: boolean; pagesDone: number; found: number; created: number; updated: number; skipped: number; rejected: number; completedAt?: string }
interface PagesState { cats: Record<string, CatCursor>; state: SourceState; lastError?: string }

const fresh = (): CatCursor => ({ page: 1, lastPage: null, done: false, refresh: false, pagesDone: 0, found: 0, created: 0, updated: 0, skipped: 0, rejected: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Headers of a page request. If the operator gave us an allow-list header for their Cloudflare rule (a secret name/value pair they
 * configured, so that requests carrying it are not challenged), it is sent from EAUCTIONS_ALLOW_HEADER_NAME / _VALUE. The value is a
 * secret: it is never printed or logged. This is an operator-approved access method, not a way around the protection.
 */
export function requestHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": UA, Accept: "text/html" };
  const name = env.EAUCTIONS_ALLOW_HEADER_NAME?.trim();
  const value = env.EAUCTIONS_ALLOW_HEADER_VALUE?.trim();
  if (name && value && /^[A-Za-z0-9-]{3,60}$/.test(name)) h[name] = value;
  return h;
}

const pageUrl = (slug: string, n: number) => (n <= 1 ? `${BASE}/category/${slug}` : `${BASE}/category/${slug}/${n}`);

async function load(feedId: string): Promise<PagesState> {
  const row = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  try { const v = (row?.sheetState ? JSON.parse(row.sheetState) : {})?.[KEY]; return v && typeof v === "object" ? { cats: {}, state: "active", ...v } : { cats: {}, state: "active" }; } catch { return { cats: {}, state: "active" }; }
}

async function save(feedId: string, st: PagesState, message?: string, status?: "ok" | "error") {
  const row = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  let all: Record<string, unknown> = {};
  try { all = row?.sheetState ? JSON.parse(row.sheetState) : {}; } catch { all = {}; }
  all[KEY] = st;
  await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: JSON.stringify(all), ...(message ? { lastMessage: message.slice(0, 1500) } : {}), ...(status ? { lastStatus: status, lastRunAt: new Date() } : {}) } });
}

export interface PagesRun { state: SourceState; message: string; pages: number; found: number; created: number; updated: number; skipped: number; rejected: number }

export async function runEauctionsPages(
  feed: { id: string; name: string; url: string },
  o: { mode: "dry" | "sample" | "full"; sampleRecords?: number; maxPages?: number; scheduled?: boolean; restart?: boolean; log?: (l: string) => void },
  env: Env = process.env,
): Promise<PagesRun> {
  const say = o.log ?? (() => undefined);
  const out: PagesRun = { state: "active", message: "", pages: 0, found: 0, created: 0, updated: 0, skipped: 0, rejected: 0 };
  const write = o.mode !== "dry";
  const auth = pagesAuthorization(env);
  if (!auth.ok) {
    out.state = "awaiting_authorization";
    out.message = `Awaiting authorization: ${auth.reason}`;
    if (write) await save(feed.id, { ...(await load(feed.id)), state: out.state, lastError: auth.reason }, out.message, "error");
    return out;
  }

  const cats = (env.EAUCTIONS_CATEGORIES ?? "residential").split(",").map((c) => c.trim().toLowerCase()).filter((c) => /^[a-z0-9-]+$/.test(c));
  const delay = Math.max(1_000, Number(env.EAUCTIONS_DELAY_MS) || 1_500);
  const perRun = o.maxPages ?? (o.scheduled ? Math.max(1, Number(env.EAUCTIONS_PAGES_PER_RUN) || 20) : o.mode === "dry" ? 3 : Infinity);
  const refreshPages = Math.max(1, Number(env.EAUCTIONS_REFRESH_PAGES) || 50);
  const minGapMs = Math.max(5, Number(env.EAUCTIONS_MIN_INTERVAL_MIN) || 360) * 60_000;
  const st = o.restart ? { cats: {}, state: "active" as SourceState } : await load(feed.id);
  let sample = 0;

  const gate = new RobotsGate({ challengeIsRefusal: true, headers: requestHeaders(env) }); // a challenge page on robots.txt is a refusal: stop before asking for any listing page
  const decision = await gate.check(pageUrl(cats[0] ?? "residential", 1));
  if (decision !== "allowed") {
    out.state = "awaiting_authorization";
    out.message = `Awaiting authorization: robots/access check returned "${decision}". The site must allow-list the user agent BankAuctionBot/1.0 (or lift the challenge). Not retried and not worked around.`;
    if (write) await save(feed.id, { ...st, state: out.state, lastError: out.message }, out.message, "error");
    return out;
  }

  outer: for (const slug of cats) {
    const c = (st.cats[slug] ??= fresh());
    if (c.done && c.completedAt && Date.now() - Date.parse(c.completedAt) < minGapMs && !o.restart) continue;
    if (c.done) Object.assign(c, fresh(), { refresh: true }); // a refresh pass: the first pages again

    while (!c.done && out.pages < perRun) {
      if (c.refresh && c.page > refreshPages) { c.done = true; c.completedAt = new Date().toISOString(); break; }
      const url = pageUrl(slug, c.page);
      const got = await fetchWithRetry(url, { headers: requestHeaders(env), signal: AbortSignal.timeout(30_000) }, { onLog: (l) => say(l) });
      if (isRefusal(got.status)) {
        out.state = "awaiting_authorization";
        out.message = `Awaiting authorization: ${describeStatus(got.status, got.http)} Not retried and not worked around; the operator must allow-list BankAuctionBot/1.0 (see docs/launch/SOURCE_ACCESS_STATUS.md).${env.EAUCTIONS_ALLOW_HEADER_NAME ? " The allow-list header was sent and was still challenged: the operator's rule does not match it." : ""}`;
        if (write) await save(feed.id, { ...st, state: out.state, lastError: out.message }, out.message, "error");
        return out;
      }
      if (got.status !== "success" || !got.res?.ok) {
        out.state = "temporarily_unavailable";
        out.message = `Temporarily unavailable on ${slug} page ${c.page}: ${got.res ? describeStatus("temporary_error", got.res.status) : describeStatus(got.status, null)} The cursor is kept; the next run continues here.`;
        if (write) await save(feed.id, { ...st, state: out.state, lastError: out.message }, out.message, "error");
        return out;
      }

      const page = parseEauctionsPage(await got.res.text(), slug);
      out.pages += 1;
      c.lastPage = page.lastPage ?? c.lastPage;
      out.found += page.records.length;
      out.rejected += page.rejected;
      c.found += page.records.length;
      say(`[eauctions] ${slug} page ${c.page}/${c.lastPage ?? "?"}: ${page.records.length} listings`);
      if (page.records.length === 0) { // an empty page is the end of the list (or a changed layout: the rejected count and the log show it)
        c.done = true; c.completedAt = new Date().toISOString();
        if (c.page === 1) { out.state = "connected_no_listings"; out.message = `Connected, but page 1 of "${slug}" had no listings the parser could read (layout changed or empty).`; if (write) await save(feed.id, { ...st, state: out.state }, out.message, "error"); return out; }
        break;
      }

      let toImport: ListingRecord[] = page.records;
      if (o.mode === "sample") {
        toImport = page.records.slice(0, Math.max(0, (o.sampleRecords ?? 20) - sample));
        sample += toImport.length;
      }
      if (write && toImport.length) {
        const r = await importRecords(toImport, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "html" });
        out.created += r.created; c.created += r.created;
        out.updated += r.updated ?? 0; c.updated += r.updated ?? 0;
        const sk = Math.max(0, r.skipped - (r.updated ?? 0)); out.skipped += sk; c.skipped += sk;
        out.rejected += r.failed; c.rejected += r.failed;
      }
      c.pagesDone += 1;
      const lastReached = c.lastPage !== null && c.page >= c.lastPage;
      c.page += 1;
      if (lastReached) { c.done = true; c.completedAt = new Date().toISOString(); }
      if (write) await save(feed.id, st); // checkpoint after every page
      if (o.mode === "sample" && sample >= (o.sampleRecords ?? 20)) break outer;
      if (!c.done && out.pages < perRun) await sleep(delay);
    }
  }

  const allDone = cats.every((s) => st.cats[s]?.done);
  out.state = o.mode === "sample" ? "partial" : allDone ? "completed" : "partial";
  const left = cats.map((s) => `${s}: page ${st.cats[s]?.page ?? 1}/${st.cats[s]?.lastPage ?? "?"}`).join(", ");
  out.message = `${out.state === "completed" ? "Completed" : "Partial (resumable)"}: ${out.pages} page(s) this run, ${out.found} listings read${write ? `, ${out.created} new, ${out.updated} updated, ${out.skipped} already on the site` : " (dry run: nothing imported)"}, ${out.rejected} rejected. ${allDone ? "" : `Position: ${left}.`}`.trim();
  if (write) await save(feed.id, { ...st, state: out.state, lastError: undefined }, out.message, "ok");
  return out;
}

export { EAUCTIONS_HOST };
