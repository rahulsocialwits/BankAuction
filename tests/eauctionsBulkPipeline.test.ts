/* Maharashtra bulk pipeline: saved list + detail pages -> merged records -> resumable batches. Real fixtures: the saved Maharashtra list page (12 cards) and the
 * real detail page 894455. A second list page is the same page under other ids (SYNTHETIC, marked in the code). No network, no database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bulkWriteAllowed, collectFromHtml, doneSig, enrichmentCoverage, runBulk } from "../src/data-sources/eauctionsindia/bulkPipeline";
import { crawlMaharashtra, pageUrl, type Checkpoint, type PageLog, type StagedListing, type Store } from "../src/data-sources/eauctionsindia/sliceCrawl";
import type { FetchOutcome } from "../src/lib/fetch/httpStatus";

const list1 = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");
const residential = readFileSync("tests/fixtures/eauctionsindia-residential-page1.html", "utf8");
const detail = readFileSync("tests/fixtures/eauctionsindia-detail-894455.html", "utf8");
/** SYNTHETIC page 2: the real page under other listing ids. */
const list2 = list1.replace(/\/properties\/(\d+)/g, (_, id) => `/properties/${Number(id) + 100000}`);
const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };

test("collects two list pages and a detail page: 24 unique Maharashtra listings, detail merged into 894455, duplicates counted", () => {
  const c = collectFromHtml([{ name: "a.html", html: list1 }, { name: "b.html", html: list2 }, { name: "d.html", html: detail }, { name: "a-again.html", html: list1 }]);
  assert.equal(c.records.size, 24);
  assert.equal(c.cardsParsed, 36);
  assert.equal(c.duplicatesAcrossFiles, 12); // the repeated page: its 12 cards are the same ids
  assert.equal(c.hasDetail.size, 1);
  assert.ok([...c.records.values()].every((r) => r.geo_state === "Maharashtra"));
});

test("detail wins, the list card only fills what the detail page leaves empty; nothing is invented", () => {
  const c = collectFromHtml([{ name: "a.html", html: list1 }, { name: "d.html", html: detail }]);
  const r = c.records.get("src:eauctionsindia.com:894455")!;
  assert.equal(r.emd, "3650000"); // only the detail page has it
  assert.equal(r.auction_end, "2026-12-09T10:30:00.000Z");
  assert.equal(r.branch, "Mumbai");
  assert.equal(r.reserve_price, "36500000");
  const other = c.records.get("src:eauctionsindia.com:882072")!;
  assert.ok(!other.emd && !other.borrower && !other.auction_end); // list-card only: missing stays missing
});

test("enrichment coverage: counts listings with and without a detail page and the detail fields still empty", () => {
  const e = enrichmentCoverage(collectFromHtml([{ name: "a.html", html: list1 }, { name: "d.html", html: detail }]));
  assert.equal(e.listings, 12);
  assert.equal(e.withDetail, 1);
  assert.equal(e.withoutDetail, 11);
  assert.equal(e.coveragePct, 8.3);
  assert.equal(e.missing["EMD"], undefined); // the one detail page has its EMD
});

test("Maharashtra only: another state's list page and a non-Maharashtra detail page are rejected, not mixed in", () => {
  const nonMh = detail.replace(/>Maharashtra</, ">Telangana<");
  const c = collectFromHtml([{ name: "res.html", html: residential }, { name: "tg.html", html: nonMh }, { name: "a.html", html: list1 }]);
  assert.equal(c.records.size, 12);
  assert.equal(c.files.find((f) => f.name === "res.html")!.kind, "not_maharashtra");
  assert.equal(c.files.find((f) => f.name === "tg.html")!.kind, "not_maharashtra");
});

test("changed layout, empty, challenge and broken files are reported, never counted as listings", () => {
  const layout = list1.replace(/<h5/g, "<h6").replace(/<\/h5>/g, "</h6>"); // headings renamed: the cards can no longer be read
  const c = collectFromHtml([{ name: "layout.html", html: layout }, { name: "empty.html", html: "" }, { name: "cf.html", html: "<title>Just a moment...</title><body>Enable JavaScript and cookies to continue</body>" }, { name: "cut.html", html: list1.slice(0, 2500) }]);
  assert.equal(c.records.size, 0);
  assert.equal(c.files.find((f) => f.name === "layout.html")!.kind, "layout_changed");
  assert.ok(c.files.filter((f) => f.kind === "list" || f.kind === "detail").length === 0);
});

test("write gate: confirm flag, authorization, note and the scope flag of where the pages came from", () => {
  assert.equal(bulkWriteAllowed({ ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, false, "saved_pages").ok, false);
  assert.equal(bulkWriteAllowed({}, true, "saved_pages").ok, false);
  assert.equal(bulkWriteAllowed(OK, true, "saved_pages").ok, false);
  assert.equal(bulkWriteAllowed({ ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, true, "crawled").ok, false); // the wrong scope for crawled pages
  assert.equal(bulkWriteAllowed({ ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, true, "saved_pages").ok, true);
  assert.equal(bulkWriteAllowed({ ...OK, EAUCTIONS_SCOPE_AUTOMATED: "yes" }, true, "crawled").ok, true);
});

/** an in-memory "database" that behaves like importRecords: a source id already stored is skipped, never duplicated */
function fakeDb() {
  const stored = new Map<string, Record<string, string | undefined>>();
  return { stored, importBatch: async (recs: Array<Record<string, string | undefined>>) => {
    let created = 0, skipped = 0;
    for (const r of recs) { const k = String(r.external_id); if (stored.has(k)) skipped++; else { stored.set(k, r); created++; } }
    return { created, updated: 0, skipped, failed: 0 };
  } };
}
const memDone = () => { const d = new Set<string>(); return { d, save: async (x: Set<string>) => { void x; } }; };

test("dry run writes nothing; import sends every listing once in bounded batches; a second run sends nothing (idempotent)", async () => {
  const c = collectFromHtml([{ name: "a.html", html: list1 }, { name: "b.html", html: list2 }]);
  const db = fakeDb();
  const dry = await runBulk({ collected: c, mode: "dry", importBatch: db.importBatch });
  assert.equal(db.stored.size, 0);
  assert.equal(dry.reconciliation.state, "dry_run");
  const done = memDone();
  const batches: number[] = [];
  const run1 = await runBulk({ collected: c, mode: "import", batchSize: 10, done: done.d, saveDone: done.save, importBatch: async (r) => { batches.push(r.length); return db.importBatch(r); } });
  assert.equal(run1.reconciliation.state, "completed");
  assert.deepEqual(batches, [10, 10, 4]);
  assert.equal(db.stored.size, 24);
  assert.equal(run1.reconciliation.thisRun.created, 24);
  const run2 = await runBulk({ collected: c, mode: "import", batchSize: 10, done: done.d, saveDone: done.save, importBatch: db.importBatch });
  assert.equal(run2.alreadyDone, 24);
  assert.equal(run2.reconciliation.thisRun.sent, 0);
  assert.equal(db.stored.size, 24);
  const fresh = await runBulk({ collected: c, mode: "import", done: new Set(), importBatch: db.importBatch }); // even without the saved list the importer does not duplicate
  assert.equal(fresh.reconciliation.thisRun.created, 0);
  assert.equal(fresh.reconciliation.thisRun.skipped, 24);
  assert.equal(db.stored.size, 24);
});

test("batch failure and recovery: a failing batch is retried, then stops with earlier batches kept; the next run resumes after them", async () => {
  const c = collectFromHtml([{ name: "a.html", html: list1 }, { name: "b.html", html: list2 }]);
  const db = fakeDb();
  const done = memDone();
  let n = 0;
  const flaky = async (r: Array<Record<string, string | undefined>>) => { if (++n >= 2) throw new Error("database down"); return db.importBatch(r); };
  const bad = await runBulk({ collected: c, mode: "import", batchSize: 10, done: done.d, saveDone: done.save, importBatch: flaky, sleep: async () => undefined });
  assert.equal(bad.reconciliation.state, "failed_batch");
  assert.equal(db.stored.size, 10); // the first batch is kept
  assert.equal(done.d.size, 10);
  const ok = await runBulk({ collected: c, mode: "import", batchSize: 10, done: done.d, saveDone: done.save, importBatch: db.importBatch });
  assert.equal(ok.alreadyDone, 10);
  assert.equal(ok.reconciliation.state, "completed");
  assert.equal(db.stored.size, 24);
});

test("a listing that later gets a detail page is sent again and enriched (its signature changed)", async () => {
  const db = fakeDb();
  const done = memDone();
  const first = collectFromHtml([{ name: "a.html", html: list1 }]);
  await runBulk({ collected: first, mode: "import", done: done.d, saveDone: done.save, importBatch: db.importBatch });
  const second = collectFromHtml([{ name: "a.html", html: list1 }, { name: "d.html", html: detail }]);
  const sent: string[] = [];
  const r = await runBulk({ collected: second, mode: "import", done: done.d, saveDone: done.save, importBatch: async (recs) => { sent.push(...recs.map((x) => String(x.external_id))); return db.importBatch(recs); } });
  assert.deepEqual(sent, ["src:eauctionsindia.com:894455"]);
  assert.equal(r.alreadyDone, 11);
  assert.notEqual(doneSig(first.records.get("src:eauctionsindia.com:894455")!), doneSig(second.records.get("src:eauctionsindia.com:894455")!));
});

test("a headline total is never coverage: coverage stays unverified and the totals are only reported as source-reported", async () => {
  const c = collectFromHtml([{ name: "a.html", html: list1 }]);
  assert.deepEqual(c.headlineTotals, [30448]);
  const r = await runBulk({ collected: c, mode: "dry" });
  assert.equal(r.reconciliation.fileCoverageVerified, false);
});

// ------------------------------------------------------------------ crawler: layout change and refusal (staging side)
const reply = (status: FetchOutcome["status"], http: number, body = ""): FetchOutcome => ({ status, http, res: new Response(body, { status: http }), attempts: 1, waitedSec: 0, log: [] });
function mem(): Store & { listings: StagedListing[]; pages: PageLog[]; cp: Checkpoint | null } {
  const s = { listings: [] as StagedListing[], pages: [] as PageLog[], cp: null as Checkpoint | null,
    loadCheckpoint: async () => s.cp, saveCheckpoint: async (c: Checkpoint) => { s.cp = c; }, stagedIds: async () => new Set(s.listings.map((l) => l.key)),
    appendListings: async (r: StagedListing[]) => { s.listings.push(...r); }, appendPage: async (p: PageLog) => { s.pages.push(p); } };
  return s;
}
const co = (store: Store, o: Record<string, unknown>) => ({ env: OK, store, robots: async () => "allowed" as const, sleep: async () => undefined, delayMs: 1000, batchPauseMs: 0, ...o });

test("crawler: three pages in a row with no readable card stop the run as layout_changed and are not counted as fetched", async () => {
  const layout = list1.replace(/<h5/g, "<h6").replace(/<\/h5>/g, "</h6>");
  const st = mem();
  const r = await crawlMaharashtra(co(st, { to: 10, fetchPage: async () => reply("success", 200, layout) }));
  assert.equal(r.state, "layout_changed");
  assert.equal(r.totals.pagesFetched, 0);
  assert.equal(st.listings.length, 0);
  assert.ok(st.pages.every((p) => p.status === "layout_changed"));
});

test("crawler: robots refusal stops before any page; staged listings carry the full record so the import can use them", async () => {
  let calls = 0;
  const refused = await crawlMaharashtra(co(mem(), { robots: async () => "disallowed", fetchPage: async () => { calls++; return reply("success", 200, list1); } }));
  assert.equal(refused.state, "robots_blocked");
  assert.equal(calls, 0);
  const st = mem();
  await crawlMaharashtra(co(st, { to: 1, fetchPage: async (u: string) => { assert.equal(u, pageUrl(1)); return reply("success", 200, list1); } }));
  const c = collectFromHtml([], { listRecords: st.listings.map((l) => l.record) });
  assert.equal(c.records.size, 12);
  assert.ok(c.records.get("src:eauctionsindia.com:894455")!.reserve_price === "36500000");
});
