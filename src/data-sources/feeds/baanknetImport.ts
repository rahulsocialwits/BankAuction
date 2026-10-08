import type { FeedSource } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { importRecords } from "@/lib/import/csvImport";
import { logRun } from "@/lib/pipeline/runLog";
import { refusedRunMetrics } from "@/lib/pipeline/completeness";
import { describeStatus, fetchWithRetry, isRefusal } from "@/lib/fetch/httpStatus";
import { baanknetRecordsFromSources } from "./deepScan";
import { RobotsGate } from "./robotsGate";
import { UA } from "./webScan";
import { webStateOf, withWebState } from "./siteScan";

/*
 * COMPLIANCE FLAG: BAANKNET ACCESS AUTHORIZATION: UNKNOWN / REQUIRES BUSINESS CONFIRMATION.
 * baanknet.com's Terms restrict copying content without written consent from PSB Alliance (see src/data-sources/registry.ts).
 * No such consent is recorded in this repository. This importer does not bypass any access control (it honours robots.txt and
 * stops on 401 / 403 / CAPTCHA), but its use must not be expanded, and the source must not be described as legally cleared,
 * until the project owner confirms authorization and records it in registry.ts.
 */

/*
 * BAANKNET importer: ALL public auction properties, resumable, no AI, no browser.
 *
 * baanknet.com draws its auction list from its own public listing data: the page asks
 *   POST /api/v1/auction/detail/auction-listing   {"search":{},"range":{},"sort":{"type":"closest"},"page":N,"limit":L,"auctionStatus":"upcoming"}
 * and the answer carries total, currentPage, totalPages and the full record of every auction (bank, borrower, reserve price, EMD,
 * dates, officer, address, image URLs, notice documents). This importer reads those pages one after the other:
 *   - the same request the site's own page makes, with the honest bot user agent, robots.txt checked first, a short pause between
 *     requests, one polite retry for 429 / 503; 401 / 403 / CAPTCHA stop it and are reported as such (never bypassed);
 *   - page after page until the site's real last page (totalPages), for each auction status ("upcoming", then "live");
 *   - the cursor (status + next page) is saved in the database AFTER every page was imported, so a function that is cut off by the
 *     time limit, or fails, continues from that page on the next scheduler tick, never from page 1;
 *   - records are matched by their BAANKNET auction id (src:baanknet.com:<id>), so reading a record again UPDATES it.
 */

const API = "https://baanknet.com/api/v1/auction/detail/auction-listing";
const CSRF = "https://baanknet.com/api/v1/auth/csrf-token";
const STATUSES = ["upcoming", "live"] as const;
const PAGE_LIMIT = 50; // records per request (the site accepts it; fewer requests for the same data)
const PAUSE_MS = 250;
const PARALLEL = 3; // pages read, then imported side by side
const REFRESH_AFTER_MS = 6 * 3_600_000; // a finished pass is repeated every 6 hours to pick up new auctions

export const isBaanknetUrl = (url: string) => {
  try { return /(^|\.)baanknet\.com$/i.test(new URL(url).hostname); } catch { return false; }
};

export interface BaanknetState {
  si: number; // index in STATUSES
  page: number; // next page to read for that status
  totalPages: Partial<Record<(typeof STATUSES)[number], number>>;
  totalRecords: Partial<Record<(typeof STATUSES)[number], number>>;
  done: boolean;
  startedAt: string;
  completedAt?: string;
  pagesDone: number;
  records: number; // records read from the site in this pass
  created: number;
  updated: number;
  skipped: number;
  held: number;
  rejected: number;
  lastError?: string;
  rejections?: { title: string; reasons: string[] }[];
}

const fresh = (): BaanknetState => ({ si: 0, page: 1, totalPages: {}, totalRecords: {}, done: false, startedAt: new Date().toISOString(), pagesDone: 0, records: 0, created: 0, updated: 0, skipped: 0, held: 0, rejected: 0 });

/** The cursor lives under its own key of FeedSource.sheetState, so no other writer of that field can overwrite it. */
export function baanknetStateOf(raw: string | null | undefined): BaanknetState | null {
  try {
    const b = raw ? JSON.parse(raw)?.baanknet : null;
    return b && typeof b === "object" ? ({ ...fresh(), ...b } as BaanknetState) : null;
  } catch {
    return null;
  }
}

function withBaanknetState(raw: string | null | undefined, st: BaanknetState): string {
  let j: Record<string, unknown> = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { /* start fresh */ }
  j.baanknet = st;
  return JSON.stringify(j);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n0 = (n: number) => n.toLocaleString("en-IN");

async function save(feedId: string, st: BaanknetState, message: string, extra: { status?: "ok" | "error"; importAll?: boolean } = {}) {
  const cur = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  let sheet = withBaanknetState(cur?.sheetState, st);
  if (extra.importAll !== undefined) sheet = withWebState(sheet, { ...webStateOf(sheet), importAll: extra.importAll });
  await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: sheet, lastMessage: message.slice(0, 1500), ...(extra.status && { lastStatus: extra.status, lastRunAt: new Date() }) } });
}

const progressLine = (st: BaanknetState) => {
  const status = STATUSES[Math.min(st.si, STATUSES.length - 1)];
  const tp = st.totalPages[status];
  return `status "${status}" page ${st.page}${tp ? `/${tp}` : ""} · ${n0(st.records)} record(s) read · ${n0(st.created)} new, ${n0(st.updated)} updated, ${n0(st.skipped)} already on the site${st.held ? `, ${n0(st.held)} held (no borrower name)` : ""}, ${n0(st.rejected)} rejected`;
};

/**
 * Runs one resumable batch of the BAANKNET import (at most `budgetMs`), saving the cursor after every page.
 * Returns the message that was stored for the source.
 */
export async function runBaanknetImport(feed: FeedSource, trigger: "schedule" | "manual", opts: { budgetMs: number; force?: boolean }): Promise<string | null> {
  const t0 = Date.now();
  const deadline = t0 + opts.budgetMs;
  const startedAt = new Date();
  let st = baanknetStateOf(feed.sheetState);
  const webImportAll = webStateOf(feed.sheetState).importAll === true;

  // Nothing to do: a finished pass is repeated only every 6 hours (or when "Import all" is pressed).
  if (st?.done && !opts.force && !webImportAll) {
    if (Date.now() - Date.parse(st.completedAt ?? st.startedAt) < REFRESH_AFTER_MS) return null;
    st = fresh();
  }
  if (!st || (st.done && (opts.force || webImportAll))) st = fresh();
  if (trigger === "schedule" && !webImportAll && !st.done && st.pagesDone === 0 && !opts.force) {
    // a source that was never imported starts by itself on the first scheduler tick
  }

  const log = (m: string) => console.log(`[baanknet] ${m}`);
  const gate = new RobotsGate();
  if ((await gate.check(API)) !== "allowed") {
    const msg = "Blocked by robots.txt: the listing data address is not allowed for our crawler. Nothing was requested.";
    st.lastError = msg;
    await save(feed.id, st, msg, { status: "error", importAll: false });
    await logRun({ source: feed.name, kind: "feed", trigger, status: "blocked", message: msg, startedAt, metrics: refusedRunMetrics(msg) }); // a refusal is recorded as BLOCKED (protects existing data) and carries no size, so it never enters a baseline
    return msg;
  }

  // the site's own handshake: a (public) token request first; its token/cookies are sent back like the page does
  let token = "";
  let cookie = "";
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Referer: "https://baanknet.com/auction-listing/property",
    Origin: "https://baanknet.com",
    ...(token ? { "x-csrf-token": token } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...extra,
  });
  try {
    const r = await fetch(CSRF, { headers: headers(), signal: AbortSignal.timeout(20_000) });
    token = r.headers.get("x-csrf-token") ?? r.headers.get("csrf-token") ?? "";
    cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  } catch { /* the listing request below reports a real network problem */ }

  let message = "";
  let stoppedBy: "budget" | "done" | "error" = "budget";
  let refused = false; // the site itself refused (401 / 403 / CAPTCHA): automatic continuation is switched OFF, never hammered every tick
  try {
    while (!st.done) {
      if (Date.now() > deadline - 55_000) { stoppedBy = "budget"; break; } // leave time to import the pages in hand and save the cursor
      const status = STATUSES[st.si];
      // Read up to PARALLEL pages (one request after the other), then import them side by side. Each page has its own records
      // (matched by BAANKNET auction id), so the pages never touch the same property; if one fails, the cursor stays before it and
      // the others are simply updated again later (an update of an unchanged record changes nothing).
      const pages: { page: number; rows: Record<string, unknown>[] }[] = [];
      let ended = false;
      let failed = false;
      for (let k = 0; k < PARALLEL; k++) {
        const page = st.page + k;
        const out = await fetchWithRetry(API, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ search: {}, range: {}, sort: { type: "closest" }, page, limit: PAGE_LIMIT, auctionStatus: status }), signal: AbortSignal.timeout(30_000) }, { onLog: (l) => log(`${status} p${page}: ${l}`), inspectBody: false });
        if (out.status !== "success" || !out.res || !out.res.ok) {
          const why = !out.res ? describeStatus("temporary_error", null) : describeStatus(out.status === "success" ? "temporary_error" : out.status, out.http);
          refused = isRefusal(out.status);
          st.lastError = `${status} page ${page}: ${why}${refused ? " The import is stopped and is not retried or worked around." : ""}`;
          failed = true;
          break;
        }
        let body: { data?: { data?: { _source?: Record<string, unknown> }[]; total?: number; totalPages?: number } };
        try { body = await out.res.json(); } catch { st.lastError = `${status} page ${page}: the answer was not valid JSON`; failed = true; break; }
        const d = body.data;
        const rows = (d?.data ?? []).map((r) => r._source).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
        if (typeof d?.totalPages === "number") st.totalPages[status] = d.totalPages;
        if (typeof d?.total === "number") st.totalRecords[status] = d.total;
        const lastPage = st.totalPages[status] ?? 0;
        if (rows.length === 0 || (lastPage > 0 && page > lastPage)) { ended = true; break; } // the site's real last page of this status
        pages.push({ page, rows });
        if (Date.now() > deadline - 55_000) break;
        await sleep(PAUSE_MS);
      }

      if (pages.length) {
        const results = await Promise.allSettled(pages.map((p) => importRecords(baanknetRecordsFromSources(p.rows), `feed:${feed.name}`, "PUBLISHED", "https://baanknet.com/", { enrich: true, strict: true, method: "api" })));
        let advance = 0;
        for (let i = 0; i < pages.length; i++) {
          const res = results[i];
          if (res.status === "rejected") { st.lastError = `${status} page ${pages[i].page}: import failed — ${res.reason instanceof Error ? res.reason.message.split("\n")[0] : String(res.reason)}`; failed = true; ended = false; break; }
          const r = res.value;
          st.pagesDone += 1;
          st.records += pages[i].rows.length;
          st.created += r.created;
          st.updated += r.updated ?? 0;
          st.skipped += Math.max(0, r.skipped - (r.updated ?? 0));
          st.held += r.held ?? 0;
          st.rejected += r.failed;
          if (r.rejections?.length) st.rejections = [...(st.rejections ?? []), ...r.rejections].slice(-20);
          advance += 1;
        }
        st.page += advance; // the cursor moves only AFTER those pages were imported
        if (advance === pages.length && !failed) st.lastError = undefined;
        log(`${status} pages ${pages[0].page}-${pages[advance ? advance - 1 : 0].page}/${st.totalPages[status] ?? "?"}: ${n0(st.records)} records so far, ${n0(st.created)} new, ${n0(st.updated)} updated`);
      }
      if (failed) { stoppedBy = "error"; await save(feed.id, st, `Running: BAANKNET import: ${progressLine(st)}`); break; }
      if (ended) {
        st.si += 1;
        st.page = 1;
        if (st.si >= STATUSES.length) { st.done = true; st.completedAt = new Date().toISOString(); stoppedBy = "done"; }
      }
      await save(feed.id, st, `Running: BAANKNET import: ${progressLine(st)}`);
    }
  } catch (e) {
    st.lastError = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
    stoppedBy = "error";
  }

  const rej = st.rejections?.length ? ` Recent rejections — ${st.rejections.slice(-5).map((x) => `${x.title.slice(0, 40)}: ${x.reasons.join(", ")}`).join(" | ")}.` : "";
  if (stoppedBy === "done") {
    message = `Import all completed: ${n0(st.pagesDone)} page(s), ${n0(st.records)} record(s) read — ${n0(st.created)} new, ${n0(st.updated)} updated, ${n0(st.skipped)} already on the site${st.held ? `, ${n0(st.held)} held (no borrower name)` : ""}, ${n0(st.rejected)} rejected.${rej} Checked again automatically every 6 hours.`;
    await save(feed.id, st, message, { status: "ok", importAll: false });
  } else if (stoppedBy === "error") {
    message = refused
      ? `BAANKNET refused the request — ${st.lastError} Saved cursor: ${progressLine(st)}. Automatic continuation is OFF; press Import all again only if you know the site allows access.`
      : `BAANKNET import stopped with an error — ${st.lastError}. Saved cursor: ${progressLine(st)}. It retries from this page on the next scheduler tick (nothing is restarted from page 1).`;
    await save(feed.id, st, message, { status: "error", importAll: !refused });
  } else {
    message = `BAANKNET import in progress: ${progressLine(st)}. Continues automatically on the next scheduler tick.${rej}`;
    await save(feed.id, st, message, { status: "ok", importAll: true });
  }
  await logRun({
    source: feed.name,
    kind: "feed",
    trigger,
    status: stoppedBy === "error" ? "error" : "ok",
    created: st.created,
    duplicates: st.skipped,
    rejected: st.rejected,
    message,
    startedAt,
    metrics: {
      inventoryCount: st.records,
      discoveredCount: Object.values(st.totalRecords).reduce((a, b) => a + (b ?? 0), 0),
      fetchedCount: st.records,
      parsedCount: st.records,
      publishedCount: st.created + st.updated,
      updatedCount: st.updated,
      duplicateCount: st.skipped,
      rejectedCount: st.rejected,
      pagesDiscovered: Object.values(st.totalPages).reduce((a, b) => a + (b ?? 0), 0),
      pagesFetched: st.pagesDone,
      paginationTotalPages: Object.values(st.totalPages).reduce((a, b) => a + (b ?? 0), 0),
      paginationComplete: st.done,
      coverageComplete: st.done,
      evaluationEligible: stoppedBy !== "budget",
      failedCount: stoppedBy === "error" ? 1 : 0,
      error: st.lastError,
      blocked: refused,
    },
  });
  return message;
}
