/* Reconciliation of the real saved Maharashtra LIST page (12 cards) against detail pages. Only 894455 is a real detail page; the others are SYNTHETIC
 * copies of it with another id (marked so), used to test the report logic. Read-only: no network, no database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEauctionsPage } from "../src/data-sources/eauctionsindia/parse";
import { reconcile } from "../src/data-sources/eauctionsindia/reconcile";

const list = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");
const real = readFileSync("tests/fixtures/eauctionsindia-detail-894455.html", "utf8");
const L = [{ name: "list.html", html: list }];
/** SYNTHETIC: the real detail page under another auction id. */
const asId = (id: string, edit: (h: string) => string = (h) => h) => edit(real.replace(/894455/g, id));

test("the list parser finds every listing id on the saved page (checked against an independent scan of the links)", () => {
  const ids = parseEauctionsPage(list, "").records.map((r) => String(r.external_id).split(":").pop());
  const fromLinks = [...new Set([...list.matchAll(/href="\/properties\/(\d+)"/g)].map((m) => m[1]))];
  assert.equal(ids.length, 12);
  assert.deepEqual([...ids].sort(), [...fromLinks].sort());
  assert.equal(new Set(ids).size, 12);
});

test("real data: 12 listing ids, the real detail page 894455 is complete, 11 detail pages are missing", () => {
  const r = reconcile(L, [{ name: "eauctions-property-894455.html", html: real }]);
  assert.equal(r.listIds, 12);
  assert.equal(r.listSaysMaharashtra, true);
  assert.equal(r.counts.DETAIL_COMPLETE, 1);
  assert.equal(r.counts.MISSING_DETAIL, 11);
  assert.deepEqual(r.readyKeys, ["src:eauctionsindia.com:894455"]);
  assert.equal(r.rows.find((x) => x.id === "894455")!.mismatches.length, 0); // list card and detail page agree on price and date
  assert.equal(r.rows.find((x) => x.id === "882072")!.status, "MISSING_DETAIL");
});

test("no detail files: every listing is missing, nothing is ready", () => {
  const r = reconcile(L, []);
  assert.equal(r.counts.MISSING_DETAIL, 12);
  assert.equal(r.readyKeys.length, 0);
});

test("duplicate detail files with the same id count once, the second is reported", () => {
  const r = reconcile(L, [{ name: "a.html", html: real }, { name: "b.html", html: real }]);
  assert.equal(r.counts.DETAIL_COMPLETE, 1);
  assert.equal(r.duplicateDetailFiles.length, 1);
  assert.deepEqual(r.duplicateDetailFiles[0], { file: "b.html", duplicateOf: "a.html", key: "src:eauctionsindia.com:894455" });
});

test("incomplete detail page: the empty fields are named, not filled in", () => {
  const noBorrower = asId("882072", (h) => h.replace(/<strong class="mr-2">Borrower Name : <\/strong>\s*<span >[^<]*<\/span>/, ""));
  const r = reconcile(L, [{ name: "x.html", html: noBorrower }]);
  const row = r.rows.find((x) => x.id === "882072")!;
  assert.equal(row.status, "DETAIL_INCOMPLETE");
  assert.deepEqual(row.missingFields, ["borrower"]);
  assert.equal(r.readyKeys.length, 0);
});

test("a price that differs between the list card and the detail page is shown as a mismatch and the listing is not ready", () => {
  const diff = asId("882072", (h) => h.replace("₹3,65,00,000.00", "₹1,00,00,000.00"));
  const r = reconcile(L, [{ name: "x.html", html: diff }]);
  const row = r.rows.find((x) => x.id === "882072")!;
  assert.ok(row.mismatches.some((m) => /reserve price/.test(m)));
  assert.equal(r.readyKeys.length, 0);
});

test("invalid, malformed and challenge files are reported by name and do not count as details", () => {
  const r = reconcile(L, [{ name: "bad.html", html: "<html" }, { name: "cf.html", html: "<title>Just a moment...</title><body>Enable JavaScript and cookies to continue</body>" }, { name: "wrongurl.html", html: asId("882072", (h) => h.replace('properties/882072">', 'properties/111111">')) }]);
  assert.equal(r.invalidFiles.length, 3);
  assert.equal(r.counts.DETAIL_COMPLETE, 0);
  assert.equal(r.rows.find((x) => x.id === "882072")!.status, "DETAIL_INVALID");
});

test("a detail page whose id is not on the list is reported, not hidden", () => {
  const r = reconcile(L, [{ name: "other.html", html: asId("999999") }]);
  assert.deepEqual(r.detailNotInList, [{ file: "other.html", key: "src:eauctionsindia.com:999999" }]);
  assert.equal(r.counts.MISSING_DETAIL, 12);
});

test("reconciliation is read-only: the module imports no database or network code", () => {
  const src = readFileSync("src/data-sources/eauctionsindia/reconcile.ts", "utf8");
  assert.ok(!/prisma|importRecords|fetch\(/.test(src.replace(/\/\*[\s\S]*?\*\//, "")));
});
