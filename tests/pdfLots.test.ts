import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPdfLots, looksScanned, lotsToListingRecords, parseAmount, parseDate } from "../src/lib/pipeline/pdfLots";

/*
 * PDF multi-lot extraction (Phase 3, PR 8).
 * FIXTURES: text-layer output laid out the way bank sale notices usually are. They are written for these tests, NOT copies of a real
 * bank's notice (no real PDF could be fetched from the sandbox). Add real extracted text from real notices before relying on this
 * for a specific bank.
 */

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", "pdf-notices", n), "utf8");
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("amounts: Indian grouping, Rs/₹/INR, '/-', lakh/lac/crore words; no number means null", () => {
  assert.equal(parseAmount("Rs. 45,00,000/-"), 4_500_000);
  assert.equal(parseAmount("₹ 4500000"), 4_500_000);
  assert.equal(parseAmount("INR 12 Lakhs"), 1_200_000);
  assert.equal(parseAmount("85 lacs"), 8_500_000);
  assert.equal(parseAmount("Rs. 1.2 Crore"), 12_000_000);
  assert.equal(parseAmount("Rs.8,50,000"), 850_000);
  assert.equal(parseAmount("to be informed"), null);
  assert.equal(parseAmount(""), null);
});

test("dates: numeric and worded formats; impossible dates are 'invalid', never guessed", () => {
  assert.equal(parseDate("12.11.2026"), "2026-11-12");
  assert.equal(parseDate("16/11/2026"), "2026-11-16");
  assert.equal(parseDate("16-11-2026"), "2026-11-16");
  assert.equal(parseDate("18th November 2026"), "2026-11-18");
  assert.equal(parseDate("18-Nov-2026"), "2026-11-18");
  assert.equal(parseDate("31.02.2026"), "invalid");
  assert.equal(parseDate("12.13.2026"), "invalid");
  assert.equal(parseDate("no date here"), null);
});

test("a 12-property notice produces 12 separate, complete lots with the right numbers", () => {
  const x = extractPdfLots(fx("multi-lot-12.txt"));
  assert.equal(x.status, "OK");
  assert.equal(x.strategy, "marker:lot");
  assert.equal(x.method, "pdf");
  assert.equal(x.claimedLots, 12);
  assert.equal(x.lots.length, 12);
  assert.deepEqual(x.lots.map((l) => l.lotNumber), Array.from({ length: 12 }, (_, i) => String(i + 1)));
  assert.ok(x.lots.every((l) => l.complete), "every lot has price, date and address");
  assert.equal(x.lots[0].reservePrice, 3_000_000);
  assert.equal(x.lots[0].emd, 300_000);
  assert.equal(x.lots[11].reservePrice, 10_700_000);
  assert.match(x.lots[3].address!, /Nagpur/);
  assert.match(x.lots[0].address!, /Thane/);
  assert.equal(new Set(x.lots.map((l) => l.address)).size, 12, "no two lots share text");
  assert.ok(x.lots.every((l) => l.auctionDate === "2026-11-12" && l.dateSource === "notice"), "one date stated in the header applies to every lot and says so");
});

test("the terms and conditions after the last lot do not leak into it", () => {
  const x = extractPdfLots(fx("multi-lot-12.txt"));
  assert.doesNotMatch(x.lots[11].excerpt + (x.lots[11].address ?? ""), /as is where is basis|deposit EMD before/i);
  assert.equal(x.lots[11].reservePrice, 10_700_000, "the Reserve Price mention in the terms is not read as lot 12's");
});

test("every lot carries a confidence; complete clean lots score higher than partial ones", () => {
  const full = extractPdfLots(fx("multi-lot-12.txt")).lots[0];
  const partial = extractPdfLots(fx("missing-fields.txt")).lots[2];
  assert.ok(full.confidence >= 0.9 && full.confidence <= 1, String(full.confidence));
  assert.ok(partial.confidence < full.confidence);
  for (const l of extractPdfLots(fx("scrambled-columns.txt")).lots) assert.ok(l.confidence >= 0 && l.confidence <= 1);
});

test("scrambled field order and values on the next line are read by label, not by position", () => {
  const x = extractPdfLots(fx("scrambled-columns.txt"));
  assert.equal(x.lots.length, 3);
  const [a, b] = x.lots;
  assert.equal(a.reservePrice, 6_250_000, "value on the line after the label");
  assert.equal(a.emd, 625_000);
  assert.equal(a.auctionDate, "2026-11-15");
  assert.equal(a.dateSource, "lot");
  assert.equal(b.reservePrice, 9_000_000, "EMD listed before Reserve Price");
  assert.equal(b.emd, 900_000);
  assert.equal(b.auctionDate, "2026-11-16");
  assert.match(b.address!, /Nashik/);
  assert.equal(b.complete, true);
});

test("EMD at or above the reserve price is flagged and BOTH values are left empty (swapped columns are not guessed)", () => {
  const c = extractPdfLots(fx("scrambled-columns.txt")).lots[2];
  assert.ok(c.issues.includes("price_inconsistent"));
  assert.equal(c.reservePrice, null);
  assert.equal(c.emd, null);
  assert.equal(c.complete, false);
});

test("missing fields stay empty with a named reason; nothing is invented or borrowed from the next field", () => {
  const x = extractPdfLots(fx("missing-fields.txt"));
  assert.equal(x.lots.length, 3);
  const [l1, l2, l3] = x.lots;
  assert.equal(l1.complete, true);
  assert.equal(l1.auctionDate, "2026-11-20");
  assert.equal(l1.dateSource, "notice");
  assert.equal(l2.reservePrice, null, "must not take the EMD amount that follows");
  assert.ok(l2.issues.includes("reserve_missing"));
  assert.equal(l2.emd, 150_000);
  assert.equal(l2.complete, false);
  assert.equal(l3.address, null);
  assert.ok(l3.issues.includes("address_missing"));
  assert.ok(l3.issues.includes("date_invalid"), "31 Feb is not a date");
  assert.equal(l3.auctionDate, null);
  assert.equal(l3.complete, false);
  assert.match(x.notes.join(" "), /2 of 3 lot/);
});

test("inconsistent formatting: lakh/crore words, worded dates and different label wording", () => {
  const x = extractPdfLots(fx("inconsistent-formatting.txt"));
  assert.equal(x.strategy, "marker:serial");
  assert.equal(x.lots.length, 2);
  assert.equal(x.lots[0].reservePrice, 12_000_000);
  assert.equal(x.lots[0].emd, 1_200_000);
  assert.equal(x.lots[0].auctionDate, "2026-11-18");
  assert.equal(x.lots[1].reservePrice, 8_500_000);
  assert.equal(x.lots[1].emd, 850_000);
  assert.equal(x.lots[1].auctionDate, "2026-11-18");
  assert.ok(x.lots.every((l) => l.complete));
});

test("a table notice yields one lot per row, amounts taken by the header's column order", () => {
  const x = extractPdfLots(fx("table-layout.txt"));
  assert.equal(x.strategy, "table");
  assert.equal(x.lots.length, 3);
  assert.equal(x.lots[0].reservePrice, 5_500_000);
  assert.equal(x.lots[0].emd, 550_000);
  assert.match(x.lots[1].address!, /Satara/);
  assert.ok(x.lots[0].complete);
});

test("a table row whose amounts do not line up with the header is NOT mapped", () => {
  const x = extractPdfLots(fx("table-layout.txt"));
  const row3 = x.lots[2];
  assert.ok(row3.issues.includes("columns_not_aligned"));
  assert.equal(row3.reservePrice, null);
  assert.equal(row3.emd, null);
  assert.equal(row3.complete, false);
});

test("a scanned notice is reported as needing OCR and nothing is extracted", () => {
  const x = extractPdfLots(fx("scanned-notice.txt"));
  assert.equal(x.status, "NEEDS_OCR");
  assert.equal(x.lots.length, 0);
  assert.match(x.notes[0], /OCR/);
  assert.equal(looksScanned(""), true);
  assert.equal(looksScanned(fx("multi-lot-12.txt")), false);
  assert.deepEqual(lotsToListingRecords(x, { documentUrl: "https://bank.example/notice.pdf" }), []);
});

test("several reserve prices with no markers or table is AMBIGUOUS: no split is attempted", () => {
  const x = extractPdfLots(fx("ambiguous-no-markers.txt"));
  assert.equal(x.status, "AMBIGUOUS");
  assert.equal(x.lots.length, 0);
});

test("text with no auction content gives NO_LOTS", () => {
  const x = extractPdfLots("This circular is about branch timings and the bank holiday list for the year. ".repeat(6));
  assert.equal(x.status, "NO_LOTS");
});

test("a notice that claims more properties than were found is PARTIAL, not OK", () => {
  const text = fx("multi-lot-12.txt").replace(/Lot No\. (10|11|12)[\s\S]*?(?=Lot No\.|Terms and Conditions)/g, "");
  const x = extractPdfLots(text);
  assert.equal(x.status, "PARTIAL");
  assert.equal(x.lots.length, 9);
  assert.match(x.notes.join(" "), /says 12 properties but 9/);
});

test("a repeated label with different values is a conflict, not a pick", () => {
  const t = `SALE NOTICE\nDated: 01.10.2026\nLot No. 1\nDescription of Property: Flat 1, Some Building, Some Road, Pune - 411001\nReserve Price: Rs. 40,00,000/-\nReserve Price: Rs. 45,00,000/-\nAuction Date: 12.11.2026\nTerms and Conditions:\n1. x`;
  const l = extractPdfLots(t).lots[0];
  assert.equal(l.reservePrice, null);
  assert.ok(l.issues.includes("reserve_conflicting"));
});

test("an auction date before the notice date is rejected", () => {
  const t = `SALE NOTICE\nDated: 01.10.2026\nLot No. 1\nDescription of Property: Flat 1, Some Building, Some Road, Pune - 411001\nReserve Price: Rs. 40,00,000/-\nAuction Date: 12.09.2026\nTerms and Conditions:\n1. x`;
  const l = extractPdfLots(t).lots[0];
  assert.equal(l.auctionDate, null);
  assert.ok(l.issues.includes("auction_before_notice"));
});

test("only COMPLETE lots become import records, each with a stable source-qualified id", () => {
  const url = "https://bank.example/notices/sale-oct-2026.pdf";
  const recs = lotsToListingRecords(extractPdfLots(fx("multi-lot-12.txt")), { documentUrl: url, bank: "Bank of Example" });
  assert.equal(recs.length, 12);
  assert.equal(new Set(recs.map((r) => r.external_id)).size, 12);
  assert.ok(recs.every((r) => /^src:bank\.example:pdf-[a-z0-9]+-lot\d+$/.test(r.external_id!)));
  assert.equal(recs[0].reserve_price, "3000000");
  assert.equal(recs[0].auction_start, "2026-11-12");
  assert.equal(recs[0].source_url, url);
  assert.equal(recs[0].bank, "Bank of Example");
  assert.deepEqual(recs.map((r) => r.external_id), lotsToListingRecords(extractPdfLots(fx("multi-lot-12.txt")), { documentUrl: url }).map((r) => r.external_id), "ids are stable");

  const partial = lotsToListingRecords(extractPdfLots(fx("missing-fields.txt")), { documentUrl: url });
  assert.equal(partial.length, 1, "only lot 1 is complete");
});

test("the module is pure and not wired into ingestion", () => {
  const s = read("src/lib/pipeline/pdfLots.ts");
  assert.doesNotMatch(s, /prisma|fetch\(|from "\.\/runLog"|node:fs/);
  for (const f of ["src/data-sources/feeds/deepScan.ts", "src/data-sources/feeds/siteScan.ts", "src/data-sources/feeds/run.ts", "src/lib/import/csvImport.ts", "src/lib/pipeline/tick.ts"]) {
    assert.doesNotMatch(read(f), /pdfLots/, `${f} must not use the PDF lot extractor yet`);
  }
});
