/*
 * BAANKNET import in SLICES, to get past the API's 10,000-result window (one query can only show its first 10,000 results; page 201
 * of "all" answers HTTP 400 "Result window is too large"). The listing is split with the filters the site's own search sends:
 *     search.stateId  x  search.propertyTypeId   (and, for a slice that is still too big, search.propertySubTypeId)
 * with auctionStatus "all". Each slice smaller than 10,000 is read completely, page by page.
 *
 *   $env:BAANKNET_SPLIT_AUTHORIZED="yes"; npx tsx scripts/baanknet-import-slices.ts --plan-only    (counts only: no import, no database write)
 *   $env:BAANKNET_SPLIT_AUTHORIZED="yes"; npx tsx scripts/baanknet-import-slices.ts                 (plan, then import; resumable)
 *   ... --max-pages=300        stop after this many pages in one run (default: no limit)
 *   ... --list-states         prints state id -> state name (one tiny request per state; no import, no database write), to pick ids for --states
 *   ... --states=21,2          only these state ids (e.g. Maharashtra first); the saved cursor keeps every other slice for a later run
 *   ... --slice-pages=N        read at most N pages (N x 50 auctions, the ones closest to today) of EACH slice; default: the whole slice
 *   ... --reset                forget the saved slice cursor (database records are NOT deleted)
 *
 * What it does and does not do
 *   - Needs BAANKNET_SPLIT_AUTHORIZED=yes: YOU confirm that the owner has approved widening the use of this source
 *     (see ownerDecision in src/data-sources/registry.ts). Without it nothing is sent.
 *   - Checks robots.txt first; stops on 401 / 403 / CAPTCHA / access-denied and never retries or works around a refusal.
 *     Honest user agent, one request at a time, a pause between requests.
 *   - Real estate only: records without a recognised real-estate category (cars, machinery, jewellery...) are not imported.
 *   - Duplicates are not created: the existing importer matches by source id, then the usual duplicate rules.
 *   - The cursor is saved after EVERY imported page under FeedSource.sheetState key "baanknetSlices" (the other cursors are untouched),
 *     so a stop (Ctrl+C, network, laptop sleep) resumes where it was.
 *   - Slices that are STILL 10,000 or more after the sub-type split are read only up to the window and listed at the end as
 *     "capped": they need one more filter, which has to be taken from the site's own search (nothing is guessed).
 *   - Nothing is ever deleted.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { baanknetRecordsFromSources } from "../src/data-sources/feeds/deepScan";
import { RobotsGate } from "../src/data-sources/feeds/robotsGate";
import { UA } from "../src/data-sources/feeds/webScan";
import { fetchWithRetry, describeStatus, isRefusal } from "../src/lib/fetch/httpStatus";
import { importRecords } from "../src/lib/import/csvImport";

const API = "https://baanknet.com/api/v1/auction/detail/auction-listing";
const CSRF = "https://baanknet.com/api/v1/auth/csrf-token";
const KEY = "baanknetSlices";
const WINDOW = 10_000;
const PAGE_LIMIT = 50;
const PAUSE_MS = 500;
const STATES = Array.from({ length: 40 }, (_, i) => i + 1);
const TYPES = Array.from({ length: 8 }, (_, i) => i + 1);
const SUBTYPES = Array.from({ length: 40 }, (_, i) => i + 1);
const REAL_ESTATE = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flag = (n: string) => process.argv.includes(`--${n}`);
const num = (n: string) => { const v = process.argv.find((a) => a.startsWith(`--${n}=`)); return v ? Number(v.slice(n.length + 3)) : null; };

interface Job { key: string; stateId: number; typeId: number; subTypeId?: number; total: number; capped: boolean }
interface SliceCursor { page: number; totalPages: number | null; done: boolean; pagesDone: number; recordsRead: number; created: number; updated: number; skipped: number; rejected: number; lastError?: string }
interface SliceState { planned: Job[] | null; plannedAt?: string; slices: Record<string, SliceCursor> }

const fresh = (): SliceState => ({ planned: null, slices: {} });
const freshSlice = (): SliceCursor => ({ page: 1, totalPages: null, done: false, pagesDone: 0, recordsRead: 0, created: 0, updated: 0, skipped: 0, rejected: 0 });

function stateFrom(sheetState: string | null | undefined): SliceState {
  try {
    const v = (sheetState ? JSON.parse(sheetState) : {})?.[KEY];
    return v && typeof v === "object" ? { ...fresh(), ...v } : fresh();
  } catch { return fresh(); }
}

async function save(feedId: string, st: SliceState, message?: string, status?: "ok" | "error") {
  const cur = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  let all: Record<string, unknown> = {};
  try { all = cur?.sheetState ? JSON.parse(cur.sheetState) : {}; } catch { all = {}; }
  all[KEY] = st;
  await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: JSON.stringify(all), ...(message ? { lastMessage: message.slice(0, 1500) } : {}), ...(status ? { lastStatus: status, lastRunAt: new Date() } : {}) } });
}

async function main() {
  if (process.env.BAANKNET_SPLIT_AUTHORIZED !== "yes") {
    console.log('BAANKNET_SPLIT_AUTHORIZED is not "yes": nothing was sent. Set it only when the owner has approved widening BAANKNET use.');
    return;
  }
  const planOnly = flag("plan-only");
  const maxPages = num("max-pages") ?? Infinity;
  const slicePages = num("slice-pages") ?? Infinity;
  const onlyStates = (process.argv.find((a) => a.startsWith("--states=")) ?? "").slice(9).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const only = onlyStates.length ? new Set(onlyStates) : null;

  const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "baanknet.com" } } });
  if (!feed) throw new Error("No baanknet.com FeedSource exists in this database.");
  const st = flag("reset") ? fresh() : stateFrom(feed.sheetState);
  if (flag("reset")) console.log("RESET: the slice cursor starts again. Database records are not deleted.");

  const gate = new RobotsGate();
  for (const url of [API, CSRF]) {
    const d = await gate.check(url);
    if (d !== "allowed") throw new Error(`Stopped: robots/access check for ${url} returned ${d}. No attempt to bypass it.`);
  }
  let token = "";
  let cookie = "";
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://baanknet.com/auction-listing/property", Origin: "https://baanknet.com",
    ...(token ? { "x-csrf-token": token } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra,
  });
  const csrf = await fetchWithRetry(CSRF, { headers: headers(), signal: AbortSignal.timeout(20_000) }, { inspectBody: false, onLog: (l) => console.log(`[csrf] ${l}`) });
  if (!csrf.res?.ok) throw new Error(`BAANKNET CSRF handshake was not accepted (${csrf.res?.status ?? csrf.status}); stopped without bypass.`);
  token = csrf.res.headers.get("x-csrf-token") ?? csrf.res.headers.get("csrf-token") ?? "";
  cookie = (csrf.res.headers.getSetCookie?.() ?? []).map((v) => v.split(";")[0]).join("; ");

  type Body = { data?: { data?: { _source?: Record<string, unknown> }[]; total?: number; totalPages?: number } };
  const post = async (search: Record<string, unknown>, page: number, limit: number): Promise<{ ok: boolean; http: number | null; body: Body | null; reason?: string }> => {
    const out = await fetchWithRetry(API, {
      method: "POST", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ search, range: {}, sort: { type: "closest" }, page, limit, auctionStatus: "all" }),
      signal: AbortSignal.timeout(30_000),
    }, { inspectBody: false });
    if (isRefusal(out.status)) throw new Error(`Stopped: ${describeStatus(out.status, out.http)} Access refusal; no retries or workarounds.`);
    if (!out.res?.ok) return { ok: false, http: out.http, body: null, reason: out.res ? describeStatus("temporary_error", out.res.status) : describeStatus(out.status, null) };
    try { return { ok: true, http: out.http, body: (await out.res.json()) as Body }; } catch { return { ok: false, http: out.http, body: null, reason: "answer was not valid JSON" }; }
  };
  const pause = async () => sleep(Math.max(PAUSE_MS, (await gate.delayFor(API)) * 1000));
  const searchOf = (j: Pick<Job, "stateId" | "typeId" | "subTypeId">) => ({ stateId: j.stateId, propertyTypeId: j.typeId, ...(j.subTypeId ? { propertySubTypeId: [j.subTypeId] } : {}) });

  // ---- 0. --list-states: id -> name, to choose --states ----
  if (flag("list-states")) {
    for (const stateId of STATES) {
      const r = await post({ stateId }, 1, 1);
      const total = Number(r.body?.data?.total ?? 0);
      const name = (r.body?.data?.data?.[0]?._source as Record<string, unknown> | undefined)?.stateName;
      if (r.ok && total > 0) console.log(`state ${String(stateId).padStart(2)}: ${String(name ?? "?")} (${total}${total >= WINDOW ? "+" : ""} auctions)`);
      await pause();
    }
    console.log("\nNothing was imported or written. Use the ids with --states=<id>,<id>.");
    return;
  }

  // ---- 1. plan: how big is every slice ----
  if (!st.planned) {
    console.log(`Planning: ${STATES.length} states x ${TYPES.length} types (small requests, no import)...`);
    const jobs: Job[] = [];
    for (const stateId of STATES) {
      for (const typeId of TYPES) {
        const r = await post({ stateId, propertyTypeId: typeId }, 1, 1);
        if (!r.ok) { console.log(`state ${stateId} type ${typeId}: ${r.reason ?? `HTTP ${r.http}`} (skipped in the plan)`); await pause(); continue; }
        const total = Number(r.body?.data?.total ?? 0);
        await pause();
        if (total === 0) continue;
        if (total < WINDOW) { jobs.push({ key: `s${stateId}-t${typeId}`, stateId, typeId, total, capped: false }); console.log(`state ${stateId} type ${typeId}: ${total}`); continue; }
        console.log(`state ${stateId} type ${typeId}: ${total}+ (window reached) -> split by sub-type`);
        for (const subTypeId of SUBTYPES) {
          const s = await post(searchOf({ stateId, typeId, subTypeId }), 1, 1);
          const t = Number(s.body?.data?.total ?? 0);
          await pause();
          if (!s.ok || t === 0) continue;
          jobs.push({ key: `s${stateId}-t${typeId}-u${subTypeId}`, stateId, typeId, subTypeId, total: t, capped: t >= WINDOW });
          console.log(`   sub-type ${subTypeId}: ${t}${t >= WINDOW ? "  STILL CAPPED" : ""}`);
        }
      }
    }
    st.planned = jobs;
    st.plannedAt = new Date().toISOString();
    const sum = jobs.reduce((n, j) => n + j.total, 0);
    console.log(`\nPLAN: ${jobs.length} slices, about ${sum} auctions in total, ${jobs.filter((j) => j.capped).length} slice(s) still capped.`);
    if (!planOnly) await save(feed.id, st, `BAANKNET slices planned: ${jobs.length} slices, about ${sum} auctions.`);
  }
  if (planOnly) { console.log("--plan-only: nothing was imported and nothing was written to the database."); return; }

  // ---- 2. import slice by slice (resumable) ----
  let pagesThisRun = 0;
  for (const job of st.planned!) {
    if (only && !only.has(job.stateId)) continue;
    const c = (st.slices[job.key] ??= freshSlice());
    if (c.done) continue;
    console.log(`\nSlice ${job.key}: about ${job.total}${job.capped ? " (capped: only the first window can be read)" : ""}, from page ${c.page}`);
    while (!c.done) {
      if (c.pagesDone >= slicePages) { c.done = true; c.lastError = `stopped by --slice-pages=${slicePages}`; await save(feed.id, st); break; }
      if (pagesThisRun >= maxPages) { await save(feed.id, st, "BAANKNET slice import paused (--max-pages)."); console.log(`\nPaused after ${pagesThisRun} pages (--max-pages). Run the same command again to continue.`); return; }
      const r = await post(searchOf(job), c.page, PAGE_LIMIT);
      if (!r.ok) {
        // page beyond the 10,000 window: this slice is finished as far as the API shows it
        if (r.http === 400 && c.page > 1) { c.done = true; c.lastError = `window reached at page ${c.page}`; await save(feed.id, st); break; }
        c.lastError = `page ${c.page}: ${r.reason ?? `HTTP ${r.http}`}`;
        await save(feed.id, st, `Stopped in ${job.key}: ${c.lastError}`, "error");
        throw new Error(`Stopped in slice ${job.key}: ${c.lastError}. The cursor is saved; run the same command again to continue.`);
      }
      const d = r.body?.data;
      if (typeof d?.totalPages === "number") c.totalPages = d.totalPages;
      const rows = (d?.data ?? []).map((x) => x?._source).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
      if (rows.length === 0 || (c.totalPages !== null && c.page > c.totalPages)) { c.done = true; await save(feed.id, st); break; }

      const mapped = baanknetRecordsFromSources(rows).filter((rec) => REAL_ESTATE.includes(String(rec.category ?? "").toUpperCase()));
      const res = await importRecords(mapped, `feed:${feed.name}`, "PUBLISHED", "https://baanknet.com/", { enrich: true, strict: true, method: "api" });
      c.pagesDone += 1; c.recordsRead += rows.length; c.created += res.created; c.updated += res.updated ?? 0;
      c.skipped += Math.max(0, res.skipped - (res.updated ?? 0)); c.rejected += res.failed; c.page += 1; c.lastError = undefined;
      pagesThisRun += 1;
      await save(feed.id, st, `BAANKNET slices: ${job.key} page ${c.page - 1}/${c.totalPages ?? "?"}`);
      console.log(`[${job.key}] page ${c.page - 1}/${c.totalPages ?? "?"}: ${rows.length} read, ${mapped.length} real estate, new ${res.created}, updated ${res.updated ?? 0}, rejected ${res.failed}`);
      await pause();
    }
  }

  if (only) {
    const mine = st.planned!.filter((j) => only.has(j.stateId));
    const done = mine.filter((j) => st.slices[j.key]?.done).length;
    console.log(`
Selected states (${[...only].join(", ")}): ${done} of ${mine.length} slices finished. The other states are untouched; run without --states to continue them.`);
    await save(feed.id, st, `BAANKNET slices: selected states ${[...only].join(",")} ${done}/${mine.length} done.`, "ok");
    return;
  }
  const all = Object.values(st.slices);
  const sum = (f: (s: SliceCursor) => number) => all.reduce((n, s) => n + f(s), 0);
  const capped = st.planned!.filter((j) => j.capped);
  const message = `BAANKNET slice import complete: ${st.planned!.length} slices, ${sum((s) => s.recordsRead)} records read, ${sum((s) => s.created)} new, ${sum((s) => s.updated)} updated, ${sum((s) => s.skipped)} already present, ${sum((s) => s.rejected)} rejected. ${capped.length} slice(s) were capped.`;
  await save(feed.id, st, message, "ok");
  console.log(`\n${message}`);
  if (capped.length) console.log("Capped slices (need one more filter from the site's own search):", capped.map((j) => j.key).join(", "));
  console.log("Source auctions now:", await prisma.auction.count({ where: { statusSource: `feed:${feed.name}` } }));
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
