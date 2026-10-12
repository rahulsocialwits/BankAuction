/*
 * SIMULATED tests: the feed is a fake in memory. They prove the engine's behaviour (paging, resume, retry, access denial, idempotence),
 * NOT that any live eAuctionsIndia integration works: no live access exists yet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runFeedImport, freshFeedCursor, type AuthorizedFeedClient, type FeedCursor, type FeedFetchResult } from "../src/data-sources/authorized/engine";
import { JsonFeedClient } from "../src/data-sources/authorized/jsonFeed";
import { cleanDate, cleanMoney, makeMapper, normalizePropertyType } from "../src/data-sources/authorized/fieldMap";
import { eauctionsConfig } from "../src/data-sources/authorized/eauctionsindia";
import type { ListingRecord } from "../src/lib/import/csvImport";

const rec = (i: number): ListingRecord => ({ title: `Flat ${i}`, external_id: `src:eauctionsindia.com:${i}`, source_url: `https://example.test/n/${i}` });
const page = (ids: number[], next: string | null): FeedFetchResult => ({ kind: "ok", records: ids.map((i) => ({ i })), nextCursor: next });
const map = (raw: unknown) => { const i = (raw as { i?: number }).i; return i === undefined ? null : i < 0 ? ({ title: "x" } as ListingRecord) : rec(i); };

function harness(pages: Record<string, FeedFetchResult | (() => FeedFetchResult)>, seeded?: FeedCursor) {
  const calls: (string | null)[] = [];
  const sleeps: number[] = [];
  let stored: FeedCursor | null = seeded ?? null;
  let saves = 0;
  const store = new Map<string, true>();
  let importCalls = 0;
  const client: AuthorizedFeedClient = {
    async fetchPage(cursor) {
      calls.push(cursor);
      const p = pages[cursor ?? "start"];
      return typeof p === "function" ? p() : p ?? { kind: "invalid", reason: `no page for ${cursor}` };
    },
  };
  const opts = (extra: Partial<Parameters<typeof runFeedImport>[0]> = {}) => ({
    client, map,
    importBatch: async (records: ListingRecord[]) => {
      importCalls++;
      let created = 0, skipped = 0;
      for (const r of records) { if (store.has(r.external_id!)) skipped++; else { store.set(r.external_id!, true); created++; } }
      return { created, updated: 0, skipped, failed: 0 };
    },
    load: async () => stored, save: async (c: FeedCursor) => { saves++; stored = JSON.parse(JSON.stringify(c)); },
    mode: "full" as const, sleep: async (ms: number) => { sleeps.push(ms); }, ...extra,
  });
  return { calls, sleeps, opts, get stored() { return stored; }, get saves() { return saves; }, get importCalls() { return importCalls; }, store };
}

test("paging runs until the feed reports no next cursor, and counts add up", async () => {
  const h = harness({ start: page([1, 2], "p2"), p2: page([3, 4], "p3"), p3: page([5], null) });
  const r = await runFeedImport(h.opts());
  assert.equal(r.state, "completed");
  assert.equal(r.cursor.pagesDone, 3);
  assert.deepEqual([r.cursor.discovered, r.cursor.parsed, r.cursor.created], [5, 5, 5]);
  assert.equal(r.cursor.done, true);
  assert.equal(h.store.size, 5);
});

test("a re-run does not duplicate: the same records are skipped, not created again", async () => {
  const h = harness({ start: page([1, 2], "p2"), p2: page([3], null) });
  await runFeedImport(h.opts());
  const again = await runFeedImport(h.opts({ restart: true }));
  assert.equal(again.cursor.created, 0);
  assert.equal(again.cursor.skipped, 3);
  assert.equal(h.store.size, 3);
});

test("an interrupted job resumes from its saved cursor and does not read finished pages again", async () => {
  let failing = true;
  const h = harness({ start: page([1, 2], "p2"), p2: page([3, 4], "p3"), p3: () => (failing ? { kind: "temporary", reason: "HTTP 503" } : page([5], null)) });
  const first = await runFeedImport(h.opts());
  assert.equal(first.state, "temporarily_unavailable");
  assert.equal(h.stored?.cursor, "p3", "the place of the last good page is kept");
  assert.equal(h.stored?.pagesDone, 2);
  failing = false;
  h.calls.length = 0;
  const second = await runFeedImport(h.opts());
  assert.equal(second.state, "completed");
  assert.deepEqual(h.calls, ["p3"], "only the missing page was requested");
  assert.equal(h.store.size, 5);
});

test("temporary errors are retried with growing waits, then succeed", async () => {
  let n = 0;
  const h = harness({ start: () => (++n < 3 ? { kind: "temporary", reason: "timeout" } : page([1], null)) });
  const r = await runFeedImport(h.opts());
  assert.equal(r.state, "completed");
  assert.deepEqual(h.sleeps, [1000, 3000]);
});

test("access denial stops at once, is not retried and is reported as awaiting authorization (never as success)", async () => {
  const h = harness({ start: { kind: "denied", http: 403, reason: "challenge page" } });
  const r = await runFeedImport(h.opts());
  assert.equal(r.state, "awaiting_authorization");
  assert.equal(h.calls.length, 1, "one request, no retry");
  assert.deepEqual(h.sleeps, []);
  assert.match(r.message, /Not retried and not worked around/);
  assert.equal(r.cursor.done, false);
});

test("an empty healthy feed is 'connected, no listings': not an access problem and not 'completed'", async () => {
  const h = harness({ start: page([], null) });
  const r = await runFeedImport(h.opts());
  assert.equal(r.state, "connected_no_listings");
  assert.equal(r.cursor.done, false);
});

test("an answer in the wrong format is a configuration error with the place of the problem", async () => {
  const h = harness({ start: { kind: "invalid", reason: 'no list of records at "data.items"' } });
  const r = await runFeedImport(h.opts());
  assert.equal(r.state, "configuration_error");
  assert.match(r.message, /data\.items/);
});

test("dry run reads and maps but imports nothing and saves nothing", async () => {
  const h = harness({ start: page([1, 2], null) });
  const r = await runFeedImport(h.opts({ mode: "dry" }));
  assert.equal(h.importCalls, 0);
  assert.equal(h.saves, 0);
  assert.equal(r.cursor.parsed, 2);
  assert.equal(r.cursor.created, 0);
});

test("sample mode imports only the asked number of records and stays resumable", async () => {
  const h = harness({ start: page([1, 2, 3, 4], "p2"), p2: page([5], null) });
  const r = await runFeedImport(h.opts({ mode: "sample", sampleSize: 3 }));
  assert.equal(h.store.size, 3);
  assert.equal(r.state, "partial");
});

test("a page or time limit ends the run as partial with the cursor saved", async () => {
  const h = harness({ start: page([1], "p2"), p2: page([2], "p3"), p3: page([3], null) });
  const r = await runFeedImport(h.opts({ maxPages: 2 }));
  assert.equal(r.state, "partial");
  assert.equal(h.stored?.cursor, "p3");
  const done = await runFeedImport(h.opts());
  assert.equal(done.state, "completed");
  assert.equal(h.store.size, 3);
});

test("a record repeated inside one page is imported once; a record without id, title or link is rejected", async () => {
  const h = harness({ start: { kind: "ok", records: [{ i: 1 }, { i: 1 }, { i: -1 }, {}], nextCursor: null } });
  const r = await runFeedImport(h.opts());
  assert.equal(h.store.size, 1);
  assert.equal(r.cursor.skipped >= 1, true);
  assert.equal(r.cursor.rejected, 2);
});

// ---- the generic JSON client (mock HTTP) ----
const cfg = { url: "https://feed.example.test/list", cursorParam: "page", recordsPath: "data.items", nextCursorPath: "data.next", pageSizeParam: "size" };
const reply = (status: number, body: string, type = "application/json") => (async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

test("JSON client: a challenge page or 403 is DENIED, 503 is temporary, bad JSON and a missing list are invalid", async () => {
  assert.equal((await new JsonFeedClient(cfg, reply(200, "<html><title>Just a moment...</title>", "text/html")).fetchPage(null, 10)).kind, "denied");
  assert.equal((await new JsonFeedClient(cfg, reply(403, "no")).fetchPage(null, 10)).kind, "denied");
  assert.equal((await new JsonFeedClient(cfg, reply(503, "busy")).fetchPage(null, 10)).kind, "temporary");
  assert.equal((await new JsonFeedClient(cfg, reply(200, "{not json")).fetchPage(null, 10)).kind, "invalid");
  assert.equal((await new JsonFeedClient(cfg, reply(200, JSON.stringify({ data: {} }))).fetchPage(null, 10)).kind, "invalid");
  assert.equal((await new JsonFeedClient(cfg, reply(200, "<html>plain</html>", "text/html")).fetchPage(null, 10)).kind, "invalid");
});

test("JSON client: reads the records and the next cursor from the configured paths; page-number mode ends on a short page", async () => {
  const ok = await new JsonFeedClient(cfg, reply(200, JSON.stringify({ data: { items: [{ a: 1 }], next: "abc" } }))).fetchPage(null, 10);
  assert.deepEqual(ok.kind === "ok" && [ok.records.length, ok.nextCursor], [1, "abc"]);
  const pn = { ...cfg, nextCursorPath: undefined, pageNumberMode: true };
  const full = await new JsonFeedClient(pn, reply(200, JSON.stringify({ data: { items: [1, 2] } }))).fetchPage("3", 2);
  assert.deepEqual(full.kind === "ok" && full.nextCursor, "4");
  const short = await new JsonFeedClient(pn, reply(200, JSON.stringify({ data: { items: [1] } }))).fetchPage("4", 2);
  assert.deepEqual(short.kind === "ok" && short.nextCursor, null);
});

test("JSON client: the credential goes only in the configured header and the user agent is the honest one", async () => {
  let seen: Record<string, string> = {};
  const spy = (async (_u: string, init: RequestInit) => { seen = init.headers as Record<string, string>; return new Response(JSON.stringify({ data: { items: [] } }), { status: 200, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
  await new JsonFeedClient({ ...cfg, authHeader: "x-api-key", token: "secret-value", tokenPrefix: "" }, spy).fetchPage(null, 5);
  assert.equal(seen["x-api-key"], "secret-value");
  assert.match(seen["User-Agent"], /BankAuctionBot/);
});

// ---- field mapping ----
test("property type: real estate is mapped, movables are excluded, unclear words stay open (never guessed)", () => {
  assert.equal(normalizePropertyType("Residential Flat"), "RESIDENTIAL");
  assert.equal(normalizePropertyType("Shop / Office"), "COMMERCIAL");
  assert.equal(normalizePropertyType("Factory Shed"), "INDUSTRIAL");
  assert.equal(normalizePropertyType("Agricultural Land"), "AGRICULTURAL");
  assert.equal(normalizePropertyType("Vacant plot"), "LAND_PLOT");
  assert.equal(normalizePropertyType("Car Hyundai Verna"), "EXCLUDED");
  assert.equal(normalizePropertyType("Plant and machinery"), "EXCLUDED");
  assert.equal(normalizePropertyType("Gold ornaments"), "EXCLUDED");
  assert.equal(normalizePropertyType("Property"), null);
});

test("money and dates: unreadable or absurd values become empty, never invented", () => {
  assert.equal(cleanMoney("₹ 1,25,000.50"), "125000.5");
  assert.equal(cleanMoney("N/A"), "");
  assert.equal(cleanMoney("0"), "");
  assert.equal(cleanDate("12/11/2026 14:30"), "2026-11-12T14:30:00.000Z");
  assert.equal(cleanDate("2026-11-12T10:00:00Z"), "2026-11-12T10:00:00.000Z");
  assert.equal(cleanDate("0001-01-01"), "");
  assert.equal(cleanDate("soon"), "");
});

test("mapper: source-qualified id, state-aware city, required id / title / url, movables dropped", () => {
  const m = makeMapper("eauctionsindia.com", { id: "id", title: "name", url: "link", city: "city", state: "state", propertyType: "type", reservePrice: "price" });
  const r = m({ id: "A1", name: "3 BHK Flat", link: "https://x.test/1", city: "aurangabad", state: "Maharashtra", type: "Flat", price: "₹ 50,00,000" })!;
  assert.equal(r.external_id, "src:eauctionsindia.com:A1");
  assert.equal(r.geo_city, "Chhatrapati Sambhajinagar");
  assert.equal(r.reserve_price, "5000000");
  assert.equal(m({ id: "A2", name: "x", link: "" }), null);
  assert.equal(m({ id: "A3", name: "Truck", link: "https://x.test/3", type: "Truck" }), null);
});

// ---- configuration and wiring ----
test("without a recorded authorisation nothing is configured and nothing is requested; missing settings are named", () => {
  const none = eauctionsConfig({});
  assert.ok(!none.ready && none.state === "awaiting_authorization");
  const half = eauctionsConfig({ EAUCTIONS_AUTHORIZED: "yes" });
  assert.ok(!half.ready && half.state === "configuration_error" && /EAUCTIONS_FEED_URL/.test(half.reason));
  const badMap = eauctionsConfig({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_FEED_URL: "https://f.test", EAUCTIONS_RECORDS_PATH: "d", EAUCTIONS_CURSOR_PARAM: "p", EAUCTIONS_FIELD_MAP: "{nope", EAUCTIONS_NEXT_CURSOR_PATH: "n" });
  assert.ok(!badMap.ready && /valid JSON/.test(badMap.reason));
  const ok = eauctionsConfig({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_FEED_URL: "https://f.test", EAUCTIONS_RECORDS_PATH: "d", EAUCTIONS_CURSOR_PARAM: "p", EAUCTIONS_NEXT_CURSOR_PATH: "n", EAUCTIONS_FIELD_MAP: '{"id":"a","title":"b","url":"c"}' });
  assert.ok(ok.ready);
});

test("the scheduler path: the eAuctionsIndia source never reaches the web scanner, and the adapter never prints or stores the credential", () => {
  const run = readFileSync("src/data-sources/feeds/run.ts", "utf8");
  assert.ok(run.indexOf("isEauctionsIndiaUrl(check.url)") > 0 && run.indexOf("isEauctionsIndiaUrl(check.url)") < run.indexOf("await robotsCheck(target)"), "the authorised-feed branch comes before robots.txt and the scanner");
  const adapter = readFileSync("src/data-sources/authorized/eauctionsindia.ts", "utf8");
  assert.doesNotMatch(adapter, /console\.log|EAUCTIONS_FEED_TOKEN\}/);
  assert.doesNotMatch(readFileSync("src/data-sources/authorized/engine.ts", "utf8"), /baanknet|eauctionsindia\.com/i);
  const code = (adapter + readFileSync("src/data-sources/authorized/jsonFeed.ts", "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /https?:\/\/(www\.)?eauctionsindia/, "no feed address is written in the code: it comes from the owner-given configuration");
});
