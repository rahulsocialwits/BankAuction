import type { ListingRecord } from "@/lib/import/csvImport";
import { fetchWithRetry, describeStatus, isRefusal, type FetchOutcome } from "@/lib/fetch/httpStatus";
import { RobotsGate } from "@/data-sources/feeds/robotsGate";
import { pagesAuthorization, requestHeaders } from "./import";
import { parseEauctionsPage } from "./parse";
import { parseEauctionsDetail } from "./parseDetail";
import { pageSaysMaharashtra } from "./maharashtra";

/*
 * Maharashtra listing pages of eAuctionsIndia, read page by page into a STAGING dataset (JSONL). It never writes to the database.
 * Ordinary requests only, with the honest user agent: no browser impersonation, no cookies, no challenge solving.
 *   - Needs EAUCTIONS_AUTHORIZED=yes and EAUCTIONS_AUTH_NOTE (same permission gate as the other eAuctionsIndia importers).
 *   - robots.txt first. A refusal or Cloudflare challenge on it stops the run before any page is requested.
 *   - A page that answers 403 / challenge / CAPTCHA is recorded as BLOCKED and is never retried. The run goes on with the next page, but
 *     stops after `maxBlocked` blocked pages in a row (a site-wide block is not hammered).
 *   - Paging: /properties-in-maharashtra, /properties-in-maharashtra/<n> (the pattern in the real saved page's own pagination links).
 *   - Every page must itself name Maharashtra, otherwise it is rejected. Missing fields stay empty and are listed per record.
 *   - "Complete" is claimed only for the page range actually requested, and only when every page in it was fetched.
 */

export const MH_BASE = "https://www.eauctionsindia.com/properties-in-maharashtra";
export const pageUrl = (n: number) => (n <= 1 ? MH_BASE : `${MH_BASE}/${n}`);

export interface StagedListing {
  id: string;
  key: string;
  title: string;
  type: string;
  location: string;
  city: string;
  area: string;
  bank: string;
  reservePrice: string;
  auctionStart: string;
  detailUrl: string;
  /** fields the card did not contain (never filled in) */
  missing: string[];
  /** true / false when a database lookup ran, null when it did not */
  inBankAuction: boolean | null;
  knownSaved: boolean;
  /** the full parsed listing record (what the importer receives); Maharashtra-checked */
  record: ListingRecord;
  source: { pageUrl: string; page: number; fetchedAt: string; fetchStatus: "fetched" };
}

export interface PageLog { page: number; url: string; status: "fetched" | "blocked" | "failed" | "not_maharashtra" | "empty" | "layout_changed"; http: number | null; listings: number; rejected: number; at: string; note?: string }

export interface DetailLog { id: string; url: string; status: "fetched" | "blocked" | "failed" | "invalid"; errors: string[]; at: string; record?: unknown }

export interface Checkpoint { from: number; to: number; nextPage: number; done: boolean; blockedPages: number[]; failedPages: number[]; totals: Totals; updatedAt: string }
export interface Totals { pagesFetched: number; parsed: number; newListings: number; duplicates: number; rejected: number; blockedPages: number; failedPages: number; notMaharashtra: number; details: number; layoutChanged: number }
const zero = (): Totals => ({ pagesFetched: 0, parsed: 0, newListings: 0, duplicates: 0, rejected: 0, blockedPages: 0, failedPages: 0, notMaharashtra: 0, details: 0, layoutChanged: 0 });

export interface Store {
  loadCheckpoint(): Promise<Checkpoint | null>;
  saveCheckpoint(c: Checkpoint): Promise<void>;
  /** ids already in the staging file */
  stagedIds(): Promise<Set<string>>;
  appendListings(rows: StagedListing[]): Promise<void>;
  appendPage(p: PageLog): Promise<void>;
  appendDetail?(d: DetailLog): Promise<void>;
}

export interface CrawlOptions {
  env: Record<string, string | undefined>;
  store: Store;
  from?: number;
  /** last page; when omitted it is read from page 1's own pagination */
  to?: number;
  batchSize?: number;
  maxPagesThisRun?: number;
  maxBlocked?: number;
  delayMs?: number;
  batchPauseMs?: number;
  dryRun?: boolean;
  restart?: boolean;
  details?: boolean;
  detailLimit?: number;
  knownIds?: Set<string>;
  /** read-only: which of these ids BankAuction already has */
  existingInDb?: (ids: string[]) => Promise<Set<string>>;
  fetchPage?: (url: string, headers: Record<string, string>) => Promise<FetchOutcome>;
  robots?: (url: string) => Promise<"allowed" | "disallowed" | "unreachable">;
  sleep?: (ms: number) => Promise<void>;
  stopped?: () => boolean;
  now?: () => Date;
  log?: (l: string) => void;
}

export type CrawlState = "layout_changed" | "no_permission" | "robots_blocked" | "bad_range" | "blocked_site_wide" | "interrupted" | "partial" | "range_complete" | "dry_run_done" | "temporarily_unavailable";
export interface CrawlResult { state: CrawlState; message: string; totals: Totals; from: number; to: number | null; nextPage: number; blockedPages: number[]; failedPages: number[]; rangeVerified: boolean }

const cardMissing = (r: Record<string, string | undefined>): string[] => {
  const m: string[] = [];
  if (!r.bank) m.push("bank");
  if (!r.auction_start) m.push("auction_date");
  if (!r.source_property_type) m.push("property_type");
  return m;
};

export async function crawlMaharashtra(o: CrawlOptions): Promise<CrawlResult> {
  const say = o.log ?? (() => undefined);
  const now = o.now ?? (() => new Date());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const headers = requestHeaders(o.env);
  const delay = Math.max(1_000, o.delayMs ?? 1_500);
  const batch = Math.max(1, Math.floor(o.batchSize ?? 25));
  const maxBlocked = Math.max(1, o.maxBlocked ?? 3);
  const totals0 = zero();
  const base = (state: CrawlState, message: string, from = 1, to: number | null = null, extra: Partial<CrawlResult> = {}): CrawlResult => ({ state, message, totals: totals0, from, to, nextPage: from, blockedPages: [], failedPages: [], rangeVerified: false, ...extra });

  const auth = pagesAuthorization(o.env);
  if (!auth.ok) return base("no_permission", `Nothing was requested. ${auth.reason}`);

  const gate = new RobotsGate({ challengeIsRefusal: true, headers });
  const robots = o.robots ?? ((u: string) => gate.check(u));
  const fetchPage = o.fetchPage ?? ((url, h) => fetchWithRetry(url, { headers: h, signal: AbortSignal.timeout(30_000) }, { onLog: say }));
  const decision = await robots(MH_BASE);
  if (decision !== "allowed") return base("robots_blocked", `Blocked at robots.txt ("${decision}": refused or challenged by Cloudflare, or disallowed). No listing page was requested. Not retried, not worked around.`);

  const from = Math.max(1, Math.floor(o.from ?? 1));
  if (o.to !== undefined && (!Number.isInteger(o.to) || o.to < from)) return base("bad_range", `Bad page range: --from=${from} --to=${o.to}.`, from, o.to);
  let cp = !o.restart ? await o.store.loadCheckpoint() : null;
  if (cp && (cp.from !== from || (o.to !== undefined && cp.to !== o.to))) cp = null; // another range: start that range afresh (the staging file is only ever appended to)
  let to = o.to ?? cp?.to ?? null;
  const totals = cp?.totals ?? zero();
  const blocked = new Set<number>(cp?.blockedPages ?? []);
  const failed = new Set<number>(cp?.failedPages ?? []);
  let page = cp && !cp.done ? cp.nextPage : from;
  if (cp?.done && !o.restart) return { state: "range_complete", message: "This range is already complete (checkpoint). Use --restart to read it again.", totals, from, to, nextPage: cp.nextPage, blockedPages: [...blocked], failedPages: [...failed], rangeVerified: blocked.size === 0 && failed.size === 0 };

  const staged = await o.store.stagedIds();
  const seen = new Set<string>(staged);
  const maxThis = o.dryRun ? Math.min(o.maxPagesThisRun ?? 2, 2) : o.maxPagesThisRun ?? Infinity;
  let pagesThisRun = 0;
  let consecutiveBlocked = 0;
  let consecutiveEmpty = 0;
  let detailsDone = 0;

  const persist = async (done: boolean) => {
    if (o.dryRun) return;
    await o.store.saveCheckpoint({ from, to: to ?? page, nextPage: page, done, blockedPages: [...blocked], failedPages: [...failed], totals, updatedAt: now().toISOString() });
  };
  const result = (state: CrawlState, message: string): CrawlResult => ({ state, message, totals, from, to, nextPage: page, blockedPages: [...blocked], failedPages: [...failed], rangeVerified: state === "range_complete" && blocked.size === 0 && failed.size === 0 });

  for (;;) {
    if (to !== null && page > to) break;
    if (pagesThisRun >= maxThis) { await persist(false); return result(o.dryRun ? "dry_run_done" : "partial", `Stopped after ${pagesThisRun} page(s) this run; next page ${page}.`); }
    if (o.stopped?.()) { await persist(false); return result("interrupted", `Stopped on request; next page ${page}. Run again to resume.`); }

    const url = pageUrl(page);
    const got = await fetchPage(url, headers);
    pagesThisRun++;
    const at = now().toISOString();
    const log = async (p: Omit<PageLog, "page" | "url" | "at">) => { if (!o.dryRun) await o.store.appendPage({ page, url, at, ...p }); };

    if (isRefusal(got.status)) {
      blocked.add(page); totals.blockedPages = blocked.size; consecutiveBlocked++;
      say(`page ${page}: BLOCKED (${describeStatus(got.status, got.http)}) — not retried`);
      await log({ status: "blocked", http: got.http, listings: 0, rejected: 0, note: `${got.status}` });
      page++;
      await persist(false);
      if (consecutiveBlocked >= maxBlocked) return result("blocked_site_wide", `Stopped: ${consecutiveBlocked} pages in a row were refused (HTTP ${got.http ?? "?"}, Cloudflare challenge or access denied). The block looks site-wide, so no more pages are requested. Blocked pages: ${[...blocked].join(", ")}.`);
      await sleep(delay);
      continue;
    }
    consecutiveBlocked = 0;
    if (got.status !== "success" || !got.res?.ok) {
      failed.add(page); totals.failedPages = failed.size;
      say(`page ${page}: failed (${got.http ?? "no answer"})`);
      await log({ status: "failed", http: got.http, listings: 0, rejected: 0 });
      page++;
      await persist(false);
      if (failed.size >= 5 && pagesThisRun === failed.size) return result("temporarily_unavailable", "Stopped: the first 5 pages all failed (temporary errors). Try again later.");
      await sleep(delay);
      continue;
    }

    const html = await got.res.text();
    if (!pageSaysMaharashtra(html)) {
      totals.notMaharashtra++;
      say(`page ${page}: does not name Maharashtra — rejected`);
      await log({ status: "not_maharashtra", http: got.http, listings: 0, rejected: 0 });
      page++;
      await persist(false);
      await sleep(delay);
      continue;
    }
    const parsed = parseEauctionsPage(html, "");
    if (to === null) {
      to = parsed.lastPage;
      if (to === null) { to = page; say("page count not found on the page; only this page is read (pass --to=N to read more)"); } else say(`pagination found: ${to} page(s) (the site's own page links)`);
    }
    totals.pagesFetched++;
    totals.rejected += parsed.rejected;
    if (parsed.records.length === 0) {
      // A page inside the known range that holds no listing card is NOT a successful empty page: either the layout changed (property links or prices
      // are there but no card could be read) or the page is empty. Never counted as progress; three in a row stop the run.
      const looksLikeListings = /href="\/properties\/\d+"|Reserve Price/i.test(html);
      const kind: "layout_changed" | "empty" = looksLikeListings || parsed.rejected > 0 ? "layout_changed" : "empty";
      totals.layoutChanged++;
      consecutiveEmpty++;
      totals.pagesFetched--;
      say(`page ${page}: no listing card could be read (${kind}) — not counted as fetched`);
      await log({ status: kind, http: got.http, listings: 0, rejected: parsed.rejected, note: kind === "layout_changed" ? "property links or prices present but no card parsed" : "no listings" });
      page++; await persist(false);
      if (consecutiveEmpty >= 3) return result("layout_changed", `Stopped: ${consecutiveEmpty} pages in a row had no readable listing card. The page layout may have changed (parser needs a new look) or the range is beyond the last page. Nothing was imported from them.`);
      if (page <= (to ?? 0)) await sleep(delay);
      continue;
    }
    consecutiveEmpty = 0;

    const fresh = parsed.records.filter((r) => { const k = String(r.external_id); if (seen.has(k)) { totals.duplicates++; return false; } seen.add(k); return true; });
    totals.parsed += parsed.records.length;
    let inDb: Set<string> | null = null;
    if (o.existingInDb && fresh.length) inDb = await o.existingInDb(fresh.map((r) => String(r.external_id)));
    const rows: StagedListing[] = fresh.map((r) => {
      const key = String(r.external_id);
      const id = key.split(":").pop()!;
      return {
        id, key, title: String(r.title ?? ""), type: String(r.source_property_type ?? ""), location: String(r.location ?? ""), city: String(r.geo_city ?? ""), area: String(r.geo_locality ?? ""),
        bank: String(r.bank ?? ""), reservePrice: String(r.reserve_price ?? ""), auctionStart: String(r.auction_start ?? ""), detailUrl: String(r.source_url ?? ""),
        missing: cardMissing(r), record: { ...r, geo_state: "Maharashtra" }, inBankAuction: inDb ? inDb.has(key) : null, knownSaved: !!o.knownIds?.has(key),
        source: { pageUrl: url, page, fetchedAt: at, fetchStatus: "fetched" },
      };
    });
    totals.newListings += rows.length;
    if (!o.dryRun && rows.length) await o.store.appendListings(rows);
    await log({ status: "fetched", http: got.http, listings: parsed.records.length, rejected: parsed.rejected });
    say(`page ${page}/${to ?? "?"}: ${parsed.records.length} listings, ${rows.length} new, ${parsed.records.length - rows.length} duplicate`);

    if (o.details && !o.dryRun && o.store.appendDetail) {
      for (const r of rows) {
        if (detailsDone >= (o.detailLimit ?? 0)) break;
        await sleep(delay);
        const d = await fetchPage(r.detailUrl, headers);
        const dat = now().toISOString();
        if (isRefusal(d.status)) { await o.store.appendDetail({ id: r.id, url: r.detailUrl, status: "blocked", errors: [describeStatus(d.status, d.http)], at: dat }); detailsDone = Infinity; break; } // a refused detail page stops detail fetching for this run
        if (d.status !== "success" || !d.res?.ok) { await o.store.appendDetail({ id: r.id, url: r.detailUrl, status: "failed", errors: [`HTTP ${d.http ?? "no answer"}`], at: dat }); continue; }
        const det = parseEauctionsDetail(await d.res.text());
        await o.store.appendDetail({ id: r.id, url: r.detailUrl, status: det.ok ? "fetched" : "invalid", errors: det.errors, at: dat, ...(det.ok ? { record: det.record } : {}) });
        if (det.ok) { totals.details++; detailsDone++; }
      }
    }

    page++;
    await persist(false);
    if (pagesThisRun % batch === 0 && !(to !== null && page > to)) { say(`-- batch of ${batch} page(s) done: ${JSON.stringify(totals)}`); await sleep(o.batchPauseMs ?? 5_000); }
    else if (to === null || page <= to) await sleep(delay);
  }
  await persist(true);
  return result(o.dryRun ? "dry_run_done" : "range_complete", `Range ${from}..${to} finished: ${blocked.size} blocked page(s), ${failed.size} failed page(s).`);
}
