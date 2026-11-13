/* The Maharashtra run is tested on the real residential page (tests/fixtures/eauctionsindia-residential-page1.html) and on a copy of it whose
 * heading is changed to name Maharashtra (SYNTHETIC: no real Maharashtra page exists in the repository). No live site was contacted. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkStartUrl, clampSample, nextPageUrl, pageSaysMaharashtra } from "../src/data-sources/eauctionsindia/maharashtra";
import { runMaharashtra, type MhDeps } from "../src/data-sources/eauctionsindia/maharashtraRun";
import type { FetchOutcome } from "../src/lib/fetch/httpStatus";

const real = readFileSync("tests/fixtures/eauctionsindia-residential-page1.html", "utf8");
const mh = real.replace(/<h1([^>]*)>[^<]*<\/h1>/, "<h1$1>1,234 Bank Auctions in Maharashtra</h1>");
const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };
const URL1 = "https://www.eauctionsindia.com/category/residential";

const reply = (status: FetchOutcome["status"], http: number, body = ""): FetchOutcome => ({ status, http, res: new Response(body, { status: http }), attempts: 1, waitedSec: 0, log: [] });
const deps = (over: Partial<MhDeps> = {}): MhDeps => ({ env: OK, robots: async () => "allowed", sleep: async () => undefined, ...over });

test("start address: required, https, eauctionsindia.com only, no credentials, not guessed", () => {
  assert.equal(checkStartUrl(undefined).ok, false);
  assert.equal(checkStartUrl("http://www.eauctionsindia.com/x").ok, false);
  assert.equal(checkStartUrl("https://evil.example.com/category/x").ok, false);
  assert.equal(checkStartUrl("https://user:pw@www.eauctionsindia.com/x").ok, false);
  assert.equal(checkStartUrl("https://www.eauctionsindia.com/admin/x").ok, false);
  assert.equal(checkStartUrl(URL1).ok, true);
});

test("a page counts as Maharashtra only if its own heading or title says so", () => {
  assert.equal(pageSaysMaharashtra(real), false);
  assert.equal(pageSaysMaharashtra(mh), true);
});

test("paging follows the page's own next link only: same site, never the current page, never a page already read", () => {
  assert.equal(nextPageUrl("https://www.eauctionsindia.com/category/residential/2", URL1, new Set([URL1])), "https://www.eauctionsindia.com/category/residential/2");
  assert.equal(nextPageUrl(null, URL1, new Set()), null);
  assert.equal(nextPageUrl(URL1, URL1, new Set()), null);
  assert.equal(nextPageUrl("https://www.eauctionsindia.com/a", URL1, new Set(["https://www.eauctionsindia.com/a"])), null);
  assert.equal(nextPageUrl("https://other.example.com/a", URL1, new Set()), null);
});

test("sample size is always capped (max 50) and at least 1", () => {
  assert.equal(clampSample(20), 20);
  assert.equal(clampSample(100000), 50);
  assert.equal(clampSample(0), 1);
  assert.equal(clampSample(undefined), 20);
});

test("no permission note: nothing is requested", async () => {
  let calls = 0;
  const r = await runMaharashtra({ mode: "dry", url: URL1 }, deps({ env: {}, fetchPage: async () => { calls++; return reply("success", 200, mh); } }));
  assert.equal(r.state, "awaiting_authorization");
  assert.equal(calls, 0);
});

test("no address: stops before any request", async () => {
  let calls = 0;
  const r = await runMaharashtra({ mode: "dry" }, deps({ fetchPage: async () => { calls++; return reply("success", 200, mh); } }));
  assert.equal(r.state, "bad_address");
  assert.equal(calls, 0);
});

test("robots.txt refusal or challenge: stops, no page is requested", async () => {
  let calls = 0;
  const r = await runMaharashtra({ mode: "dry", url: URL1 }, deps({ robots: async () => "disallowed", fetchPage: async () => { calls++; return reply("success", 200, mh); } }));
  assert.equal(r.state, "awaiting_authorization");
  assert.equal(calls, 0);
});

test("403 / CAPTCHA on a page: reported as awaiting authorization, fetched once, nothing imported", async () => {
  for (const [s, h] of [["forbidden", 403], ["captcha", 403]] as const) {
    let calls = 0, imports = 0;
    const r = await runMaharashtra({ mode: "sample", url: URL1 }, deps({ env: { ...OK, EAUCTIONS_SCOPE_AUTOMATED: "yes" }, fetchPage: async () => { calls++; return reply(s, h, "Just a moment"); }, importBatch: async () => { imports++; return { created: 0, updated: 0, skipped: 0, failed: 0 }; } }));
    assert.equal(r.state, "awaiting_authorization");
    assert.equal(calls, 1);
    assert.equal(imports, 0);
    assert.equal(r.imported.created, 0);
  }
});

test("a page that does not say Maharashtra is not imported", async () => {
  let imports = 0;
  const r = await runMaharashtra({ mode: "sample", url: URL1 }, deps({ env: { ...OK, EAUCTIONS_SCOPE_AUTOMATED: "yes" }, fetchPage: async () => reply("success", 200, real), importBatch: async () => { imports++; return { created: 0, updated: 0, skipped: 0, failed: 0 }; } }));
  assert.equal(r.state, "not_maharashtra");
  assert.equal(imports, 0);
});

test("dry run: parses the listings, writes nothing (no importer is even available), reads at most 2 pages", async () => {
  const urls: string[] = [];
  const r = await runMaharashtra({ mode: "dry", url: URL1 }, deps({ fetchPage: async (u) => { urls.push(u); return reply("success", 200, mh); } }));
  assert.equal(r.state, "dry_ok");
  assert.equal(r.found, 4);
  assert.equal(urls[0], URL1);
  assert.equal(urls[1], "https://www.eauctionsindia.com/category/residential/2");
  assert.ok(urls.length <= 2);
  assert.equal(r.imported.created, 0);
});

test("sample: capped to the requested number, records carry Maharashtra, duplicates across pages are dropped", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const r = await runMaharashtra({ mode: "sample", url: URL1, sampleRecords: 3 }, deps({ env: { ...OK, EAUCTIONS_SCOPE_AUTOMATED: "yes" },
    fetchPage: async () => reply("success", 200, mh),
    importBatch: async (recs) => { sent.push(...(recs as Array<Record<string, unknown>>)); return { created: recs.length, updated: 0, skipped: 0, failed: 0 }; },
  }));
  assert.equal(r.state, "sample_ok");
  assert.equal(sent.length, 3);
  assert.ok(sent.every((x) => x.geo_state === "Maharashtra"));
  assert.equal(new Set(sent.map((x) => x.external_id)).size, 3);

  const sent2: unknown[] = [];
  const r2 = await runMaharashtra({ mode: "sample", url: URL1, sampleRecords: 50 }, deps({ env: { ...OK, EAUCTIONS_SCOPE_AUTOMATED: "yes" },
    fetchPage: async () => reply("success", 200, mh), // the same page again as page 2: all duplicates
    importBatch: async (recs) => { sent2.push(...recs); return { created: recs.length, updated: 0, skipped: 0, failed: 0 }; },
  }));
  assert.equal(sent2.length, 4);
  assert.ok(r2.duplicates >= 4);
});

test("interruption stops before the next page", async () => {
  const r = await runMaharashtra({ mode: "dry", url: URL1 }, deps({ stopped: () => true, fetchPage: async () => reply("success", 200, mh) }));
  assert.equal(r.state, "interrupted");
});

test("a temporary error is not reported as success", async () => {
  const r = await runMaharashtra({ mode: "dry", url: URL1 }, deps({ fetchPage: async () => reply("service_unavailable", 503) }));
  assert.equal(r.state, "temporarily_unavailable");
});

/* REAL-DATA fixture: tests/fixtures/eauctionsindia-maharashtra-page1.html is page 1 of https://www.eauctionsindia.com/properties-in-maharashtra
 * saved by the user from the browser (view-source, unwrapped; the csrf token is redacted). One page only: not evidence of Maharashtra coverage. */
import { inspectLocalPage, unwrapViewSource } from "../src/data-sources/eauctionsindia/maharashtra";
import { parseEauctionsPage, typeToCategory } from "../src/data-sources/eauctionsindia/parse";
const real1 = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");

test("real Maharashtra page 1: 12 valid cards, none rejected, ids unique, headline 30,448, 2,538 pages, own next link", () => {
  const p = parseEauctionsPage(real1, "");
  assert.equal(p.records.length, 12);
  assert.equal(p.rejected, 0);
  assert.equal(new Set(p.records.map((r) => r.external_id)).size, 12);
  assert.equal(p.headlineTotal, 30448);
  assert.equal(p.lastPage, 2538);
  assert.equal(p.nextUrl, "https://www.eauctionsindia.com/properties-in-maharashtra/2");
  assert.equal(pageSaysMaharashtra(real1), true);
  assert.ok(p.records.every((r) => String(r.source_url).startsWith("https://www.eauctionsindia.com/properties/") && r.reserve_price && r.geo_city));
});

test("real Maharashtra page 1: a listing's fields are read exactly (price, India-time date, bank, place) and the trailing dot of 'Palus.' is dropped from the locality", () => {
  const p = parseEauctionsPage(real1, "");
  const a = p.records.find((r) => String(r.external_id).endsWith(":894455"))!;
  assert.equal(a.reserve_price, "36500000");
  assert.equal(a.auction_start, "2026-12-09T08:30:00.000Z");
  assert.equal(a.bank, "Debts Recovery Tribunal");
  assert.equal(a.geo_city, "Sangli");
  assert.equal(a.geo_locality, "Palus");
  const house = p.records.find((r) => String(r.external_id).endsWith(":877710"))!;
  assert.equal(house.bank, ""); // no institution logo on that card: left empty, not guessed
  assert.ok(p.records.every((r) => !r.geo_state)); // the list page has no state; the importer sets it only after the page names Maharashtra
});

test("an unknown property type on a mixed list stays unclassified (never 'residential' by default)", () => {
  assert.equal(typeToCategory("Shop", ""), "COMMERCIAL");
  assert.equal(typeToCategory("Something Odd", ""), "");
});

test("--file report: counts the real cards, says Maharashtra, imports nothing; a view-source wrapper is unwrapped", () => {
  const r = inspectLocalPage(real1, 3);
  assert.equal(r.cards, 12);
  assert.equal(r.saysMaharashtra, true);
  assert.equal(r.samples.length, 3);
  const wrapped = `<html><body><table><tbody>${real1.split("\n").map((l) => `<tr><td class="line-content">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>`).join("")}</tbody></table></body></html>`;
  assert.equal(unwrapViewSource(wrapped), real1);
  assert.equal(inspectLocalPage(wrapped).cards, 12);
  assert.equal(inspectLocalPage(real).saysMaharashtra, false); // the residential page is not Maharashtra
});
