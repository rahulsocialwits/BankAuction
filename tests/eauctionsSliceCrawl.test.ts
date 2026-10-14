/* The Maharashtra page crawler, tested with the REAL saved Maharashtra page (tests/fixtures/eauctionsindia-maharashtra-page1.html) served by a fake
 * fetch. No network, no database. Nothing here proves a live run: the real site currently answers a Cloudflare challenge. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crawlMaharashtra, pageUrl, MH_BASE, type Checkpoint, type CrawlOptions, type DetailLog, type PageLog, type StagedListing, type Store } from "../src/data-sources/eauctionsindia/sliceCrawl";
import type { FetchOutcome } from "../src/lib/fetch/httpStatus";

const html = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");
const residential = readFileSync("tests/fixtures/eauctionsindia-residential-page1.html", "utf8");
const detail = readFileSync("tests/fixtures/eauctionsindia-detail-894455.html", "utf8");
const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };

const reply = (status: FetchOutcome["status"], http: number, body = ""): FetchOutcome => ({ status, http, res: new Response(body, { status: http }), attempts: 1, waitedSec: 0, log: [] });
/** the saved page 1 with other listing ids, so that page n holds 12 new listings (SYNTHETIC ids on the real page structure) */
const pageN = (n: number) => html.replace(/\/properties\/(\d+)/g, (_, id) => `/properties/${Number(id) + n * 100000}`).replace(/Auction ID :# (\d+)/g, (_, id) => `Auction ID :# ${Number(id) + n * 100000}`);

function memStore(): Store & { listings: StagedListing[]; pages: PageLog[]; details: DetailLog[]; cp: Checkpoint | null; saves: number } {
  const s = {
    listings: [] as StagedListing[], pages: [] as PageLog[], details: [] as DetailLog[], cp: null as Checkpoint | null, saves: 0,
    loadCheckpoint: async () => s.cp,
    saveCheckpoint: async (c: Checkpoint) => { s.cp = JSON.parse(JSON.stringify(c)); s.saves++; },
    stagedIds: async () => new Set(s.listings.map((l) => l.key)),
    appendListings: async (r: StagedListing[]) => { s.listings.push(...r); },
    appendPage: async (p: PageLog) => { s.pages.push(p); },
    appendDetail: async (d: DetailLog) => { s.details.push(d); },
  };
  return s;
}
const base = (store: Store, over: Partial<CrawlOptions> = {}): CrawlOptions => ({ env: OK, store, robots: async () => "allowed", sleep: async () => undefined, delayMs: 1000, batchPauseMs: 0, ...over });

test("page URLs follow the saved page's own pagination pattern", () => {
  assert.equal(pageUrl(1), MH_BASE);
  assert.equal(pageUrl(2), "https://www.eauctionsindia.com/properties-in-maharashtra/2");
  assert.equal(pageUrl(2538), "https://www.eauctionsindia.com/properties-in-maharashtra/2538");
});

test("no permission: nothing is requested; robots refusal / challenge: no page is requested", async () => {
  let calls = 0;
  const st = memStore();
  const fp = async () => { calls++; return reply("success", 200, html); };
  assert.equal((await crawlMaharashtra(base(st, { env: {}, fetchPage: fp }))).state, "no_permission");
  assert.equal((await crawlMaharashtra(base(st, { robots: async () => "disallowed", fetchPage: fp }))).state, "robots_blocked");
  assert.equal(calls, 0);
});

test("reads the pages, discovers the page count from the page itself, stages the real listings with source URL and fetch status", async () => {
  const st = memStore();
  const r = await crawlMaharashtra(base(st, { to: 2, fetchPage: async (u) => reply("success", 200, u === pageUrl(1) ? html : pageN(1)) }));
  assert.equal(r.state, "range_complete");
  assert.equal(r.totals.pagesFetched, 2);
  assert.equal(r.totals.parsed, 24);
  assert.equal(st.listings.length, 24);
  const a = st.listings.find((l) => l.id === "894455")!;
  assert.equal(a.title, "Plot for sale in Palus., Sangli");
  assert.equal(a.reservePrice, "36500000");
  assert.equal(a.auctionStart, "2026-12-09T08:30:00.000Z");
  assert.equal(a.bank, "Debts Recovery Tribunal");
  assert.equal(a.detailUrl, "https://www.eauctionsindia.com/properties/894455");
  assert.deepEqual(a.source, { pageUrl: MH_BASE, page: 1, fetchedAt: a.source.fetchedAt, fetchStatus: "fetched" });
  assert.deepEqual(st.listings.find((l) => l.id === "877710")!.missing, ["bank"]); // the Nashik card has no institution: marked, not guessed
  assert.equal(r.rangeVerified, true);
  const disc = await crawlMaharashtra(base(memStore(), { maxPagesThisRun: 1, fetchPage: async () => reply("success", 200, html) }));
  assert.equal(disc.to, 2538); // page count read from the page's own pagination
});

test("a blocked page (403 / Cloudflare challenge) is recorded, never retried; the run continues with the next page", async () => {
  const st = memStore();
  const hits: string[] = [];
  const r = await crawlMaharashtra(base(st, { to: 3, fetchPage: async (u) => { hits.push(u); return u === pageUrl(2) ? reply("captcha", 403, "Just a moment") : reply("success", 200, pageN(u === pageUrl(1) ? 0 : 2)); } }));
  assert.equal(hits.filter((u) => u === pageUrl(2)).length, 1);
  assert.deepEqual(r.blockedPages, [2]);
  assert.equal(r.totals.pagesFetched, 2);
  assert.equal(r.rangeVerified, false); // a blocked page in the range: coverage is never claimed
  assert.equal(st.pages.find((p) => p.page === 2)!.status, "blocked");
});

test("three blocked pages in a row stop the run (a site-wide block is not hammered)", async () => {
  const st = memStore();
  let calls = 0;
  const r = await crawlMaharashtra(base(st, { to: 50, fetchPage: async () => { calls++; return reply("forbidden", 403); } }));
  assert.equal(r.state, "blocked_site_wide");
  assert.equal(calls, 3);
  assert.equal(st.listings.length, 0);
  assert.equal(r.rangeVerified, false);
});

test("duplicates: the same id on two pages, or already in the staging file, is staged once; known saved ids are flagged", async () => {
  const st = memStore();
  const known = new Set(["src:eauctionsindia.com:894455"]);
  const r = await crawlMaharashtra(base(st, { to: 2, knownIds: known, fetchPage: async () => reply("success", 200, html) }));
  assert.equal(st.listings.length, 12);
  assert.equal(r.totals.duplicates, 12);
  assert.equal(st.listings.find((l) => l.id === "894455")!.knownSaved, true);
  assert.equal(st.listings.find((l) => l.id === "882072")!.knownSaved, false);
  const again = await crawlMaharashtra(base(st, { to: 1, restart: true, fetchPage: async () => reply("success", 200, html) }));
  assert.equal(again.totals.newListings, 0);
  assert.equal(st.listings.length, 12); // appended to, never duplicated
});

test("database lookup (read-only) marks ids BankAuction already has", async () => {
  const st = memStore();
  await crawlMaharashtra(base(st, { to: 1, existingInDb: async (ids) => new Set(ids.slice(0, 2)), fetchPage: async () => reply("success", 200, html) }));
  assert.equal(st.listings.filter((l) => l.inBankAuction === true).length, 2);
  assert.equal(st.listings.filter((l) => l.inBankAuction === false).length, 10);
});

test("a page that does not name Maharashtra is rejected, nothing staged from it", async () => {
  const st = memStore();
  const r = await crawlMaharashtra(base(st, { to: 1, fetchPage: async () => reply("success", 200, residential) }));
  assert.equal(r.totals.notMaharashtra, 1);
  assert.equal(st.listings.length, 0);
});

test("resume: a checkpoint is saved after every page and an interrupted run continues at the next page", async () => {
  const st = memStore();
  const urls: string[] = [];
  const fp = async (u: string) => { urls.push(u); return reply("success", 200, pageN(Number(u.split("/").pop()) || 0)); };
  const first = await crawlMaharashtra(base(st, { to: 4, maxPagesThisRun: 2, fetchPage: fp }));
  assert.equal(first.state, "partial");
  assert.equal(st.cp!.nextPage, 3);
  assert.ok(st.saves >= 2);
  const second = await crawlMaharashtra(base(st, { to: 4, fetchPage: fp }));
  assert.equal(second.state, "range_complete");
  assert.deepEqual(urls.map((u) => u.split("/").pop()), ["properties-in-maharashtra", "2", "3", "4"]);
  assert.equal(st.listings.length, 48);
  assert.equal((await crawlMaharashtra(base(st, { to: 4, fetchPage: fp }))).message.includes("already complete"), true);
});

test("graceful interruption stops before the next page and keeps the position", async () => {
  const st = memStore();
  let n = 0;
  const r = await crawlMaharashtra(base(st, { to: 5, stopped: () => ++n > 2, fetchPage: async (u) => reply("success", 200, pageN(Number(u.split("/").pop()) || 0)) }));
  assert.equal(r.state, "interrupted");
  assert.equal(st.cp!.nextPage, 3);
});

test("dry run reads at most 2 pages and writes nothing (no listings, no pages, no checkpoint)", async () => {
  const st = memStore();
  const r = await crawlMaharashtra(base(st, { dryRun: true, to: 50, fetchPage: async () => reply("success", 200, html) }));
  assert.equal(r.state, "dry_run_done");
  assert.equal(r.totals.pagesFetched, 2);
  assert.equal(st.listings.length + st.pages.length + st.saves, 0);
});

test("bad page range is refused before any request", async () => {
  let calls = 0;
  const r = await crawlMaharashtra(base(memStore(), { from: 5, to: 2, fetchPage: async () => { calls++; return reply("success", 200, html); } }));
  assert.equal(r.state, "bad_range");
  assert.equal(calls, 0);
});

test("detail pages: fetched only when asked, parsed with the detail parser; a refused detail page stops detail fetching", async () => {
  const st = memStore();
  const r = await crawlMaharashtra(base(st, { to: 1, details: true, detailLimit: 3, fetchPage: async (u) => (u === MH_BASE ? reply("success", 200, html) : u.endsWith("/894455") ? reply("success", 200, detail) : reply("forbidden", 403)) }));
  assert.equal(r.totals.details, 1);
  const ok = st.details.find((d) => d.id === "894455")!;
  assert.equal(ok.status, "fetched");
  assert.equal((ok.record as { emd: string }).emd, "3650000");
  assert.ok(st.details.some((d) => d.status === "blocked"));
  const none = memStore();
  await crawlMaharashtra(base(none, { to: 1, fetchPage: async () => reply("success", 200, html) }));
  assert.equal(none.details.length, 0);
});

test("the crawler never writes to the database and sends no cookies or browser headers", () => {
  const src = readFileSync("src/data-sources/eauctionsindia/sliceCrawl.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/prisma|importRecords|cookie/i.test(src));
  const script = readFileSync("scripts/eauctionsindia-import-slices.ts", "utf8").replace(/\/\*[\s\S]*?\*\//, "");
  assert.ok(!/importRecords|feedSource|cookie/i.test(script)); // only a read-only auction.findMany behind --check-database
});
