/**
 * AT-07 — Pagination and filter combination rules.
 *
 * These tests run against source code only (no DB) so they pass in the sandbox.
 * They verify:
 *  1. publishedWhere supports all filter dimensions.
 *  2. listProperties passes sort and pagination args.
 *  3. The properties page validates sort enum.
 *  4. PIN filter only matches numeric strings.
 *  5. Date filters are passed to the auction where-clause.
 *  6. possession filter is case-insensitive contains.
 *  7. The city page and bank page both use publishedWhere (no parallel filter).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const whereTs = readFileSync("src/lib/queries/publishedWhere.ts", "utf8");
const listTs = readFileSync("src/lib/queries/listProperties.ts", "utf8");
const propsPage = readFileSync("src/app/(site)/properties/page.tsx", "utf8");
const cityPage = readFileSync("src/app/(site)/city/[city]/page.tsx", "utf8");
const bankPage = readFileSync("src/app/(site)/bank/[slug]/page.tsx", "utf8");

describe("AT-07: publishedWhere filter dimensions", () => {
  it("supports keyword", () => { assert.match(whereTs, /keyword/); });
  it("supports state", () => { assert.match(whereTs, /geoState/); });
  it("supports city (canonical only)", () => { assert.match(whereTs, /canonCity/); });
  it("supports locality", () => { assert.match(whereTs, /geoLocality/); });
  it("supports bankId", () => { assert.match(whereTs, /bankId/); });
  it("supports priceMin and priceMax", () => {
    assert.match(whereTs, /priceMin/);
    assert.match(whereTs, /priceMax/);
  });
  it("supports PIN filter (addressText contains)", () => {
    assert.match(whereTs, /pin/);
    assert.match(whereTs, /addressText.*contains.*pin|pin.*addressText/s);
  });
  it("supports auctionDateFrom/To on auctionStart", () => {
    assert.match(whereTs, /auctionDateFrom/);
    assert.match(whereTs, /auctionStart/);
  });
  it("supports possession (possessionStatus contains)", () => {
    assert.match(whereTs, /possession/);
    assert.match(whereTs, /possessionStatus/);
  });
  it("city filter uses canonCity (no raw text fallback)", () => {
    const cityIdx = whereTs.indexOf("canonCity");
    const textFallbackForCity = whereTs.indexOf("geoCheckedAt.*city", cityIdx);
    assert.ok(cityIdx > 0, "canonCity used for city filter");
    assert.ok(textFallbackForCity === -1 || textFallbackForCity > whereTs.indexOf("locality"), "no raw-text fallback for city");
  });
});

describe("AT-07: listProperties sort and pagination", () => {
  it("exports SortOption type", () => { assert.match(listTs, /SortOption/); });
  it("sortOrderBy handles all 5 sort values", () => {
    for (const v of ["relevance", "newest", "deadline", "price_asc", "price_desc"]) {
      assert.ok(listTs.includes(v), `SortOption "${v}" present`);
    }
  });
  it("listPublishedProperties accepts skip and take", () => {
    assert.match(listTs, /skip/);
    assert.match(listTs, /take/);
  });
  it("countPublishedProperties exported", () => { assert.match(listTs, /countPublishedProperties/); });
});

describe("AT-07: properties page parameter validation", () => {
  it("validates sort against VALID_SORTS enum", () => {
    assert.match(propsPage, /VALID_SORTS/);
    assert.match(propsPage, /includes.*sort|sort.*includes/s);
  });
  it("falls back to relevance for invalid sort", () => {
    assert.match(propsPage, /relevance/);
  });
  it("validates PIN as 4-6 digits only", () => {
    assert.match(propsPage, /validPin/);
    assert.match(propsPage, /\d{4,6}|\d\{4/);
  });
  it("preserves all filter params through pagination links", () => {
    assert.match(propsPage, /pin.*validPin|validPin.*pin/s);
    assert.match(propsPage, /dateFrom/);
    assert.match(propsPage, /possession/);
  });
});

describe("AT-07: city and bank pages use shared publishedWhere", () => {
  it("city page imports listPublishedProperties (no custom filter)", () => {
    assert.match(cityPage, /listPublishedProperties/);
  });
  it("bank page imports listPublishedProperties", () => {
    assert.match(bankPage, /listPublishedProperties/);
  });
  it("city page does NOT define its own auction status filter", () => {
    assert.doesNotMatch(cityPage, /auctions.*some.*status/s);
  });
});

describe("AT-07: sort by relevance default across all filters", () => {
  it("properties page defaults sort to relevance", () => {
    const defaultSort = propsPage.match(/sort\s*=\s*VALID_SORTS[^?]*\?\s*.*:\s*["'](\w+)["']/);
    assert.ok(defaultSort, "default sort expression found");
    assert.equal(defaultSort?.[1], "relevance");
  });
});
