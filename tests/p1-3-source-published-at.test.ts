import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBankAuctionsRecord } from "../src/data-sources/bankauctions/normalize";
import type { RawAuctionRecord } from "../src/data-sources/bankauctions/extract";

function makeRecord(fields: Record<string, string[]> = {}): RawAuctionRecord {
  return { title: "Test Property", fields, documents: [] };
}

describe("P1.3 sourcePublishedAt extraction", () => {
  it("extracts Notice Date", () => {
    const rec = makeRecord({ "Notice Date": ["15/09/2024"] });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.ok(norm.sourcePublishedAt instanceof Date, "should be a Date");
    assert.equal(norm.sourcePublishedAt!.getFullYear(), 2024);
    assert.equal(norm.sourcePublishedAt!.getMonth(), 8); // 0-indexed
    assert.equal(norm.sourcePublishedAt!.getDate(), 15);
  });

  it("falls back to Published Date when Notice Date is absent", () => {
    const rec = makeRecord({ "Published Date": ["01/03/2025"] });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.ok(norm.sourcePublishedAt instanceof Date);
    assert.equal(norm.sourcePublishedAt!.getFullYear(), 2025);
  });

  it("falls back to Date of Publication", () => {
    const rec = makeRecord({ "Date of Publication": ["20/06/2024"] });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.ok(norm.sourcePublishedAt instanceof Date);
    assert.equal(norm.sourcePublishedAt!.getFullYear(), 2024);
  });

  it("prefers Notice Date over Published Date", () => {
    const rec = makeRecord({
      "Notice Date": ["10/01/2024"],
      "Published Date": ["20/01/2024"],
    });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.ok(norm.sourcePublishedAt instanceof Date);
    assert.equal(norm.sourcePublishedAt!.getDate(), 10);
  });

  it("returns null when no date field present", () => {
    const rec = makeRecord({ "Reserve Price": ["100000"] });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.equal(norm.sourcePublishedAt, null);
  });

  it("returns null for placeholder value", () => {
    // parseIndianDateTime returns null for non-date strings
    const rec = makeRecord({ "Notice Date": ["N/A"] });
    const norm = normalizeBankAuctionsRecord(rec);
    assert.equal(norm.sourcePublishedAt, null);
  });
});
