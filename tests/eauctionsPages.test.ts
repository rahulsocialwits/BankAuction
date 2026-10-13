/* REAL-DATA fixture: tests/fixtures/eauctionsindia-residential-page1.html holds listings copied from the real page
 * https://www.eauctionsindia.com/category/residential (supplied by the user, 12-13 Oct 2026): four listings, the pagination and the headline.
 * The importer is NOT tested against the live site: the site answers our crawler with a Cloudflare challenge. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEauctionsPage, parseEauctionsDate, typeToCategory } from "../src/data-sources/eauctionsindia/parse";
import { pagesAuthorization } from "../src/data-sources/eauctionsindia/import";

const html = readFileSync("tests/fixtures/eauctionsindia-residential-page1.html", "utf8");

test("real page: four listings (the advertisement block is skipped) with id, type, place, price and the source link", () => {
  const p = parseEauctionsPage(html, "residential");
  assert.equal(p.records.length, 4);
  assert.equal(p.rejected, 0);
  const a = p.records[0];
  assert.equal(a.external_id, "src:eauctionsindia.com:855892");
  assert.equal(a.source_url, "https://www.eauctionsindia.com/properties/855892");
  assert.equal(a.reserve_price, "11000000");
  assert.equal(a.category, "LAND_PLOT");
  assert.equal(a.geo_city, "Hyderabad");
  assert.equal(a.geo_locality, "Ghatkesar");
  assert.match(a.title!, /Land for sale in Ghatkesar, Hyderabad/);
});

test("real page: a dated listing keeps its auction time (India time to UTC) and its institution; an 'Upcoming Auction' has no invented date", () => {
  const p = parseEauctionsPage(html);
  const dated = p.records.find((r) => r.external_id!.endsWith(":890304"))!;
  assert.equal(dated.auction_start, "2026-12-23T08:30:00.000Z");
  assert.equal(dated.bank, "Debts Recovery Tribunal");
  const upcoming = p.records.find((r) => r.external_id!.endsWith(":855892"))!;
  assert.equal(upcoming.auction_start, "");
});

test("real page: unique ids, the headline total, the last page number and the next link are read", () => {
  const p = parseEauctionsPage(html);
  assert.equal(new Set(p.records.map((r) => r.external_id)).size, p.records.length);
  assert.equal(p.headlineTotal, 125451);
  assert.equal(p.lastPage, 10455);
  assert.equal(p.nextUrl, "https://www.eauctionsindia.com/category/residential/2");
});

test("what the list page does not contain stays empty: no state, no EMD, no coordinates, no photo, no borrower", () => {
  for (const r of parseEauctionsPage(html).records) {
    assert.equal(r.geo_state, undefined);
    assert.equal(r.emd, undefined);
    assert.equal(r.latitude, undefined);
    assert.equal(r.media, undefined);
    assert.equal(r.borrower, undefined);
  }
});

test("types: land and plot are land, 'Land And Building' on the residential list is residential, vehicles and machinery are dropped", () => {
  assert.equal(typeToCategory("Land", "residential"), "LAND_PLOT");
  assert.equal(typeToCategory("Plot", "residential"), "LAND_PLOT");
  assert.equal(typeToCategory("House", "residential"), "RESIDENTIAL");
  assert.equal(typeToCategory("Land And Building", "residential"), "RESIDENTIAL");
  assert.equal(typeToCategory("Car", "residential"), "EXCLUDED");
  assert.equal(typeToCategory("Plant and machinery", "residential"), "EXCLUDED");
});

test("dates: India time to UTC, invalid days and hours refused", () => {
  assert.equal(parseEauctionsDate("23-12-2026 02:00 PM"), "2026-12-23T08:30:00.000Z");
  assert.equal(parseEauctionsDate("12-01-2027 12:00 AM"), "2027-01-11T18:30:00.000Z");
  assert.equal(parseEauctionsDate("31-02-2026 01:00 PM"), "");
  assert.equal(parseEauctionsDate("Upcoming Auction"), "");
  assert.equal(parseEauctionsDate("23-12-2026 14:00"), "");
});

test("an unreadable or empty page gives no listing and a card without a price is rejected, not guessed", () => {
  assert.equal(parseEauctionsPage("<html><body>nothing</body></html>").records.length, 0);
  const noPrice = html.replace(/Reserve Price : ₹[\d,.]+/g, "Reserve Price : ");
  const p = parseEauctionsPage(noPrice);
  assert.equal(p.records.length, 0);
  assert.equal(p.rejected, 4);
});

test("permission gate: nothing is requested without EAUCTIONS_AUTHORIZED=yes and a note saying where the written permission is", () => {
  assert.equal(pagesAuthorization({}).ok, false);
  assert.equal(pagesAuthorization({ EAUCTIONS_AUTHORIZED: "yes" }).ok, false);
  assert.equal(pagesAuthorization({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "short" }).ok, false);
  assert.equal(pagesAuthorization({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "email from the operator, 13 Oct 2026" }).ok, true);
});

test("the importer: permission check first, robots check next, refusals stop the run, requests are paced, no borrower data read", () => {
  const src = readFileSync("src/data-sources/eauctionsindia/import.ts", "utf8");
  assert.ok(src.indexOf("pagesAuthorization(env)") < src.indexOf("gate.check("));
  assert.ok(src.indexOf("gate.check(") < src.indexOf("fetchWithRetry("));
  assert.match(src, /isRefusal\(got\.status\)/);
  assert.match(src, /Math\.max\(1_000/);
  assert.match(src, /out.state = "awaiting_authorization"/);
  assert.doesNotMatch(readFileSync("src/data-sources/eauctionsindia/parse.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /borrower/i);
  assert.match(readFileSync("src/data-sources/authorized/eauctionsindia.ts", "utf8"), /runEauctionsPages\(feed/);
});
