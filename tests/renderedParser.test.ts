import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isoIst, isUsable, parseRenderedProperty, toListingRecord } from "../src/data-sources/feeds/renderedParser";
import { isJsShell } from "../src/data-sources/feeds/render";

const TEXT = readFileSync(new URL("./fixtures/baanknet-detail.txt", import.meta.url), "utf8");
const html = (text: string) => `<html><body>${text.split("\n").map((l) => `<div>${l.replace(/&/g, "&amp;")}</div>`).join("")}</body></html>`;
const URL_PROPERTY = "https://baanknet.com/property-detail/238156";
const URL_AUCTION = "https://baanknet.com/auction-detail/361880";

// ---- the JavaScript shell detection -----------------------------------------------------------------------------------

test("an empty React shell (the plain HTML of a BAANKNET detail page) is detected", () => {
  const shell = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title></title><script>/* gtm */</script></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';
  const r = isJsShell(shell);
  assert.equal(r.shell, true);
  assert.match(r.why, /app root/);
});

test("a normal page with real content is not a shell", () => {
  const page = `<html><body><h1>Flat in Mumbai</h1><p>${"Reserve price Rs 40,00,000. EMD 4,00,000. Auction date 20 Sept. ".repeat(20)}</p><script src="a.js"></script></body></html>`;
  assert.equal(isJsShell(page).shell, false);
});

// ---- the rendered page is parsed by code, nothing invented ------------------------------------------------------------

test("REAL rendered BAANKNET page -> normalized property (every field)", () => {
  const p = parseRenderedProperty(html(TEXT), URL_PROPERTY, TEXT);
  assert.equal(p.propertyId, "PUNBABA37896859");
  assert.equal(p.auctionId, "361880");
  assert.equal(p.title, "Individual House for sale in Guntur");
  assert.equal(p.propertyType, "Individual House");
  assert.equal(p.category, "RESIDENTIAL");
  assert.equal(p.bankName, "Punjab National Bank");
  assert.equal(p.borrowerName, "DEVI MATCHING CENTRE");
  assert.equal(p.borrowerStatus, "available");
  assert.equal(p.city, "Guntur");
  assert.equal(p.district, "Guntur");
  assert.equal(p.state, "Andhra Pradesh");
  assert.equal(p.pincode, "522007");
  assert.equal(p.reservePrice, 7000000);
  assert.equal(p.emd, 700000);
  assert.equal(p.auctionStart, "2026-10-06T10:00:00");
  assert.equal(p.auctionEnd, "2026-10-06T16:00:00");
  assert.equal(p.emdDeadline, "2026-10-06T16:00:00");
  assert.equal(p.auctionDate, "2026-10-06");
  assert.equal(p.auctionTime, "10:00");
  assert.equal(p.possessionStatus, "Symbolic");
  assert.equal(p.officerName, "M Velayutham");
  assert.equal(p.officerPhone, "9840037314");
  assert.equal(p.latitude, 16.328513);
  assert.equal(p.longitude, 80.434343);
  assert.ok(p.address?.includes("Koritepadu"));
  assert.equal(p.sourceUrl, URL_PROPERTY);
  assert.deepEqual(p.missing, []);
  assert.equal(isUsable(p), true);
});

test("the borrower is NOT invented when the page does not show it: marked not_available_from_source", () => {
  const without = TEXT.replace("Borrower's Name\nDEVI MATCHING CENTRE\n", "").replace("Registered Address of Borrower\nFLAT NO. 3, ROHINI APARTMENT,, 2/3, BRODIPET, GUNTUR, GUNTUR, ANDHRA PRADESH- 522002\n", "");
  const p = parseRenderedProperty(html(without), URL_PROPERTY, without);
  assert.equal(p.borrowerName, null);
  assert.equal(p.borrowerStatus, "not_available_from_source");
  assert.deepEqual(p.missing, ["borrower_name_missing"]);
  assert.equal(isUsable(p), true); // the rest is complete: the property is kept (held as needs_enrichment), not thrown away
  assert.equal(toListingRecord(p).borrower, "");
  assert.equal(toListingRecord(p).borrower_status, "not_available_from_source");
});

test("missing fields are reported with exact reason codes, never as a bare count", () => {
  const bare = "Individual House for sale in Guntur\nProperty ID PUNBABA37896859\nPunjab National Bank\n";
  const p = parseRenderedProperty(html(bare), URL_PROPERTY, bare);
  assert.ok(p.missing.includes("reserve_price_missing"));
  assert.ok(p.missing.includes("auction_date_missing"));
  assert.ok(p.missing.includes("address_missing"));
  assert.ok(p.missing.includes("borrower_name_missing"));
  assert.equal(p.reservePrice, null);
  assert.equal(isUsable(p), false); // not enough: the AI reader (or a rejection with these reasons) takes over
});

// ---- identity / duplicate detection ----------------------------------------------------------------------------------

test("the same property read from its property-detail AND its auction-detail page has ONE stable identity (no duplicate)", () => {
  const a = toListingRecord(parseRenderedProperty(html(TEXT), URL_PROPERTY, TEXT));
  const b = toListingRecord(parseRenderedProperty(html(TEXT), URL_AUCTION, TEXT));
  assert.equal(a.external_id, "src:baanknet.com:361880");
  assert.equal(a.external_id, b.external_id);
  assert.notEqual(a.source_url, b.source_url);
});

test("a re-auction of the same property has a different auction id, so it is a new round, not an update of the old one", () => {
  const later = TEXT.replace("361880", "377001").replace("06-10-2026 10:00:00", "20-10-2026 10:00:00").replace(/70,00,000/g, "63,00,000");
  const a = toListingRecord(parseRenderedProperty(html(TEXT), URL_PROPERTY, TEXT));
  const b = toListingRecord(parseRenderedProperty(html(later), URL_PROPERTY, later));
  assert.notEqual(a.external_id, b.external_id);
  assert.equal(b.reserve_price, "6300000");
});

// ---- the importer's listing format -----------------------------------------------------------------------------------

test("toListingRecord produces the importer's format with deep_done and a source-qualified id", () => {
  const r = toListingRecord(parseRenderedProperty(html(TEXT), URL_PROPERTY, TEXT));
  assert.equal(r.title, "Individual House for sale in Guntur");
  assert.equal(r.bank, "Punjab National Bank");
  assert.equal(r.borrower, "DEVI MATCHING CENTRE");
  assert.equal(r.reserve_price, "7000000");
  assert.equal(r.emd, "700000");
  assert.equal(r.auction_start, "2026-10-06T10:00:00");
  assert.equal(r.location, "Guntur, Andhra Pradesh, 522007");
  assert.equal(r.deep_done, "1");
  assert.ok(r.external_id?.startsWith("src:"));
});

test("isoIst understands the formats pages use and refuses junk", () => {
  assert.equal(isoIst("06-10-2026 10:00:00"), "2026-10-06T10:00:00");
  assert.equal(isoIst("6 Oct 2026"), null); // a written month is left to the AI reader, never guessed
  assert.equal(isoIst("06/10/2026 04:30 PM"), "2026-10-06T16:30:00");
  assert.equal(isoIst("2026-10-06T10:00"), "2026-10-06T10:00:00");
  assert.equal(isoIst("31-13-2026"), null);
  assert.equal(isoIst(""), null);
});
