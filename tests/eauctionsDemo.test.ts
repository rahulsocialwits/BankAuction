/* Demo report from the real saved pages (list page + detail 894455). Read-only, no network, no database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDemo, inr, istDate } from "../src/data-sources/eauctionsindia/demoReport";

const list = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");
const detail = readFileSync("tests/fixtures/eauctionsindia-detail-894455.html", "utf8");

test("formatting: Indian grouping and India time", () => {
  assert.equal(inr("36500000"), "₹3,65,00,000");
  assert.equal(inr("3650000"), "₹36,50,000");
  assert.equal(inr("999"), "₹999");
  assert.equal(inr(""), "");
  assert.equal(istDate("2026-12-09T08:30:00.000Z"), "09 Dec 2026, 2:00 PM IST");
  assert.equal(istDate(""), "");
});

test("summary from the real saved pages: 12 cards, 1 complete, 11 missing, 0 duplicates, database not checked", () => {
  const d = buildDemo(list, [{ name: "d.html", html: detail }], { generatedOn: "2026-10-13" });
  assert.deepEqual({ ...d.summary }, {
    savedListings: 12, completeDetails: 1, incompleteDetails: 0, invalidDetailFiles: 0, missingDetails: 11, duplicates: 0, detailFiles: 1,
    headlineTotal: 30448, databaseCount: null, saysMaharashtra: true,
  });
  assert.equal(d.rows.length, 12);
});

test("html: labelled as saved-page sample data, shows real values, marks missing details, never claims the headline total as imported", () => {
  const { html } = buildDemo(list, [{ name: "d.html", html: detail }], { generatedOn: "2026-10-13" });
  assert.match(html, /SAVED-PAGE SAMPLE DATA/);
  assert.match(html, /not imported into BankAuction/);
  assert.match(html, /#894455/);
  assert.match(html, /₹3,65,00,000/);
  assert.match(html, /₹36,50,000/); // EMD, from the detail page
  assert.match(html, /09 Dec 2026, 2:00 PM IST/);
  assert.match(html, /Debts Recovery Tribunal/);
  assert.equal((html.match(/Detail page not saved/g) ?? []).length, 11);
  assert.match(html, /30,448/);
  assert.match(html, /it is not what BankAuction has collected/);
  assert.ok(!/imported 30,448|30,448 (properties|listings) imported/i.test(html));
  assert.ok(!/REDACTED|9860034984/.test(html)); // no contact person or phone
});

test("a missing value is marked, not invented (the Nashik card has no institution logo)", () => {
  const { html, rows } = buildDemo(list, [], {});
  assert.equal(rows.find((r) => r.id === "877710")!.bank, "");
  assert.match(html, /not on the list card/);
  assert.equal((html.match(/Detail page not saved/g) ?? []).length, 12);
});

test("database count appears only when given; no database module is imported by the report", () => {
  assert.match(buildDemo(list, [], { databaseCount: 0 }).html, /<b>0<\/b><span>eAuctionsIndia rows in the database<\/span>/);
  assert.match(buildDemo(list, [], {}).html, /not checked/);
  const src = readFileSync("src/data-sources/eauctionsindia/demoReport.ts", "utf8").replace(/\/\*[\s\S]*?\*\//, "");
  assert.ok(!/prisma|importRecords|fetch\(/.test(src));
});

test("text from the pages is escaped in the report", () => {
  const evil = detail.replace("Palus.", "Palus<script>alert(1)</script>.");
  const { html } = buildDemo(list, [{ name: "d.html", html: evil }], {});
  assert.ok(!html.includes("<script>alert(1)</script>"));
});
