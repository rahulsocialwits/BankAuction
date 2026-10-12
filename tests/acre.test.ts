/* REAL-DATA fixture: tests/fixtures/acre-assets-page.html is two cards and their drawers copied from the public page
 * https://www.acreindia.in/assets-for-sale on 12 Oct 2026 (robots.txt allows all). Borrower names and loan numbers were removed. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAcrePage, parseAcreDate, parseMapLink } from "../src/data-sources/acre/parse";

const html = readFileSync("tests/fixtures/acre-assets-page.html", "utf8");

test("real page: every card becomes a listing with a stable source id, price, EMD, dates, place and documents", () => {
  const p = parseAcrePage(html);
  assert.equal(p.records.length, 2);
  assert.equal(p.rejected, 0);
  assert.equal(p.total, 54);
  assert.equal(p.nextUrl, "https://www.acreindia.in/assets-for-sale?property_type=retail&page=2");
  const r = p.records[0];
  assert.equal(r.external_id, "src:acreindia.in:64");
  assert.equal(r.source_url, "https://www.acreindia.in/assets-for-sale#asset-64");
  assert.equal(r.reserve_price, "450000");
  assert.equal(r.emd, "45000");
  assert.equal(r.geo_city, "Surat");
  assert.equal(r.geo_state, "Gujarat");
  assert.equal(r.category, "LAND_PLOT");
  assert.match(r.title!, /Plot for sale in Surat/);
  assert.equal(r.auction_start, "2026-10-15T06:30:00.000Z");
  assert.equal(r.application_deadline, "2026-10-14T06:30:00.000Z");
  const docs = JSON.parse(r.documents!) as { title: string; url: string }[];
  assert.ok(docs.length >= 1 && docs.every((d) => /^https:\/\/www\.acreindia\.in\/storage\//.test(d.url)));
  assert.equal(JSON.parse(r.media!).length, 1);
});

test("real page: the exact point comes from the source's own map link", () => {
  const r = parseAcrePage(html).records[0];
  assert.equal(Number(r.latitude), 21.142834);
  assert.equal(Number(r.longitude), 73.04657);
});

test("real page: ids are unique, so re-running cannot create duplicates", () => {
  const ids = parseAcrePage(html).records.map((r) => r.external_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("privacy (D07): borrower names and loan numbers are never read into a record", () => {
  const records = parseAcrePage(html).records;
  const blob = JSON.stringify(records);
  assert.doesNotMatch(blob, /borrower:/i);
  assert.ok(records.every((r) => r.borrower_status === "not_published" && !("borrower" in r)));
  const src = readFileSync("src/data-sources/acre/parse.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /borrower-row|detail-borrower|loan account/i, "the parser does not touch those elements");
});

test("a card without an id, a price or a city is rejected, not guessed", () => {
  const broken = html.replace(/data-asset-id="64"/g, 'data-asset-id=""').replace(/class="rsp-val"/g, 'class="x"');
  const p = parseAcrePage(broken);
  assert.equal(p.records.length, 0);
  assert.equal(p.rejected, 2);
});

test("an empty page and a page without paging give no records and no next link", () => {
  const p = parseAcrePage("<html><body><p>nothing</p></body></html>");
  assert.deepEqual([p.records.length, p.total, p.nextUrl], [0, null, null]);
});

test("dates and map links: unreadable or implausible values are refused", () => {
  assert.equal(parseAcreDate("15 October 2026"), "2026-10-15T06:30:00.000Z");
  assert.equal(parseAcreDate("31 February 2026"), "");
  assert.equal(parseAcreDate("soon"), "");
  assert.equal(parseAcreDate("15 October 1999"), "");
  assert.deepEqual(parseMapLink("https://www.google.com/maps?q=21.142834,73.046570"), { lat: 21.142834, lng: 73.04657 });
  assert.equal(parseMapLink("https://www.google.com/maps?q=51.5,-0.12"), null);
  assert.equal(parseMapLink("https://example.test/"), null);
});

test("the importer checks robots.txt first, stops at a refusal, paces its requests and never reaches the AI scanner", () => {
  const imp = readFileSync("src/data-sources/acre/import.ts", "utf8");
  assert.ok(imp.indexOf("gate.check(") < imp.indexOf("fetchWithRetry("), "robots.txt before any page");
  assert.match(imp, /isRefusal\(got\.status\)/);
  assert.match(imp, /sleep\(1_500\)/);
  const run = readFileSync("src/data-sources/feeds/run.ts", "utf8");
  const fn = run.slice(run.indexOf("export async function runWebDiscovery"));
  assert.ok(fn.indexOf("isAcreUrl(feed.url)") > 0 && fn.indexOf("isAcreUrl(feed.url)") < fn.indexOf("scanSiteForNew("));
});
