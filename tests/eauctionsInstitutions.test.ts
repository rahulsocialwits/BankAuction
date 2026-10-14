/* The 105 reference institutions against what eAuctionsIndia shows. Real evidence: the saved eAuctionsIndia pages in tests/fixtures. No institution DIRECTORY page was
 * supplied, so only the institutions those pages show can be CONFIRMED; the directory cases below use a SYNTHETIC directory (marked) to test the logic. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ORIGINAL_INSTITUTIONS, CATEGORY_ENTRIES, buildMapping, evidenceFromHtml, matchInstitution, mappingToCsv, mappingToTxt, normalizeInstitution, parseDirectory } from "../src/data-sources/eauctionsindia/institutions";

const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, "utf8");
const real = [
  ...evidenceFromHtml(fx("eauctionsindia-maharashtra-page1.html"), "maharashtra-page1"),
  ...evidenceFromHtml(fx("eauctionsindia-residential-page1.html"), "residential-page1"),
  ...evidenceFromHtml(fx("eauctionsindia-detail-894455.html"), "detail-894455"),
];
const matches = (name: string) => matchInstitution(name).map((m) => m.original);

test("the reference list holds exactly 105 distinct entries, in the owner's order", () => {
  assert.equal(ORIGINAL_INSTITUTIONS.length, 105);
  assert.equal(new Set(ORIGINAL_INSTITUTIONS.map((x) => x.toLowerCase())).size, 105);
  assert.equal(ORIGINAL_INSTITUTIONS[0], "Aadhar Housing Finance Ltd");
  assert.equal(ORIGINAL_INSTITUTIONS[104], "Yes Bank");
  assert.deepEqual(CATEGORY_ENTRIES, ["Liquidation"]);
});

test("normalisation and aliases: legal suffixes, '&', co-operative, ARC and official name variations match", () => {
  assert.deepEqual(matches("Aadhar Housing Finance Limited"), ["Aadhar Housing Finance Ltd"]);
  assert.deepEqual(matches("AAVAS FINANCIERS LTD."), ["Aavas Financiers"]);
  assert.deepEqual(matches("Cosmos Co-operative Bank Ltd"), ["Cosmos Bank"]);
  assert.deepEqual(matches("Omkara Asset Reconstruction Company Limited"), ["Omkara ARC"]);
  assert.deepEqual(matches("Edelweiss Asset Reconstruction Company Ltd"), ["Edelweiss ARC"]);
  assert.deepEqual(matches("Piramal Capital and Housing Finance Limited"), ["Piramal Capital & Housing Finance"]);
  assert.deepEqual(matches("Authum Investment and Infrastructure Limited"), ["Authum Investment & Infrastructure Ltd"]);
  assert.deepEqual(matches("Bangalore City Co-operative Bank"), ["Bangalore City Co Operative Bank"]);
  assert.deepEqual(matches("Standard Chartered Bank"), ["Standard Chartered"]);
  assert.equal(matchInstitution("ACRE")[0].method, "alias");
  assert.equal(normalizeInstitution("  The Federal Bank Ltd. "), "federal bank");
});

test("false positives are rejected: similar names are different institutions (no substring or fuzzy matching)", () => {
  assert.deepEqual(matches("Bank of India"), ["Bank of India"]); // not Bank of Baroda, not Bank of Maharashtra
  assert.deepEqual(matches("Bank of Baroda"), ["Bank of Baroda"]);
  assert.deepEqual(matches("ICICI Bank Limited"), ["ICICI Bank"]); // not ICICI Home Finance
  assert.deepEqual(matches("ICICI Home Finance Company Limited"), ["ICICI Home Finance Company"]);
  assert.deepEqual(matches("Indian Bank"), ["Indian Bank"]); // not Indian Overseas Bank
  assert.deepEqual(matches("Punjab National Bank"), ["Punjab National Bank"]); // not Punjab & Sind Bank
  assert.deepEqual(matches("Muthoot Homefin"), ["Muthoot Homefin"]); // not Muthoot Housing Finance Company
  for (const near of ["Union Bank", "State Bank of Hyderabad", "Muthoot Finance", "HDFC Ltd", "Bank of", "Axis", "Debts Recovery Tribunal Mumbai", "", "   "]) assert.deepEqual(matches(near), [], `"${near}" must not match`);
});

test("reconciliation covers all 105 entries exactly once, with a status each", () => {
  const rows = buildMapping(real, { directoryComplete: false, directoryFiles: [] });
  assert.equal(rows.length, 105);
  assert.deepEqual(rows.map((r) => r.original), [...ORIGINAL_INSTITUTIONS]);
  assert.equal(new Set(rows.map((r) => r.original)).size, 105);
  assert.equal(rows.filter((r) => ["CONFIRMED", "MISSING", "UNCERTAIN", "CATEGORY"].includes(r.status)).length, 105);
});

test("real evidence: exactly the four institutions the saved pages show are CONFIRMED; nothing is MISSING without a directory", () => {
  const rows = buildMapping(real, { directoryComplete: false, directoryFiles: [] });
  const confirmed = rows.filter((r) => r.status === "CONFIRMED").map((r) => r.original).sort();
  assert.deepEqual(confirmed, ["Axis Bank", "Bank of Baroda", "Debts Recovery Tribunal", "Union Bank of India"]);
  assert.equal(rows.filter((r) => r.status === "MISSING").length, 0);
  const drt = rows.find((r) => r.original === "Debts Recovery Tribunal")!;
  assert.equal(drt.url, "https://www.eauctionsindia.com/bank/debts-recovery-tribunal"); // seen on the real detail page
  assert.equal(rows.find((r) => r.original === "Axis Bank")!.url, ""); // logo only: no directory URL is invented
});

test("Aadhar Housing Finance and Acre India ARC are never called missing without directory evidence; Liquidation is a category", () => {
  const rows = buildMapping(real, { directoryComplete: false, directoryFiles: [] });
  assert.equal(rows.find((r) => r.original === "Aadhar Housing Finance Ltd")!.status, "UNCERTAIN");
  assert.equal(rows.find((r) => r.original === "Acre India Arc")!.status, "UNCERTAIN");
  const liq = rows.find((r) => r.original === "Liquidation")!;
  assert.equal(liq.status, "CATEGORY");
  assert.equal(liq.matched, "");
  assert.ok(!mappingToTxt(rows, "CONFIRMED").includes("Liquidation"));
  assert.ok(mappingToTxt(rows, ["UNCERTAIN", "CATEGORY"]).includes("Liquidation"));
});

test("SYNTHETIC directory: a listed name is CONFIRMED with its URL; absent names are MISSING only when the directory is declared complete, else UNCERTAIN", () => {
  const syntheticDirectory = `<ul><li><a href="/bank/aadhar-housing-finance">Aadhar Housing Finance Limited</a></li><li><a href="/bank/some-other-bank">Some Other Bank</a></li></ul>`;
  const dir = parseDirectory(syntheticDirectory, "synthetic-directory.html");
  assert.equal(dir.length, 2);
  const partial = buildMapping([...real, ...dir], { directoryComplete: false, directoryFiles: ["synthetic-directory.html"] });
  const complete = buildMapping([...real, ...dir], { directoryComplete: true, directoryFiles: ["synthetic-directory.html"] });
  for (const rows of [partial, complete]) {
    const a = rows.find((r) => r.original === "Aadhar Housing Finance Ltd")!;
    assert.equal(a.status, "CONFIRMED");
    assert.equal(a.url, "https://www.eauctionsindia.com/bank/aadhar-housing-finance");
    assert.equal(a.matched, "Aadhar Housing Finance Limited");
  }
  assert.equal(partial.filter((r) => r.status === "MISSING").length, 0);
  assert.equal(complete.find((r) => r.original === "HDFC Bank")!.status, "MISSING");
  assert.equal(complete.find((r) => r.original === "Liquidation")!.status, "CATEGORY"); // never MISSING
  assert.equal(complete.find((r) => r.original === "Debts Recovery Tribunal")!.status, "CONFIRMED"); // seen on a real page, even though the synthetic directory lacks it
});

test("report files: the CSV has a header and 105 rows (each original once); the lists add up to 105", () => {
  const rows = buildMapping(real, { directoryComplete: false, directoryFiles: [] });
  const csv = mappingToCsv(rows).trim().split("\n");
  assert.equal(csv.length, 106);
  assert.match(csv[0], /^n,original_name,matched_official_name,directory_url,status,match_type,evidence_notes$/);
  const total = ["CONFIRMED", "MISSING"].map((s) => Number(mappingToTxt(rows, s as "CONFIRMED").split(" of ")[0])).reduce((a, b) => a + b, 0) + Number(mappingToTxt(rows, ["UNCERTAIN", "CATEGORY"]).split(" of ")[0]);
  assert.equal(total, 105);
});

test("the generated files in docs/launch agree with the code", () => {
  const csv = readFileSync("docs/launch/eauctionsindia-institution-mapping.csv", "utf8").trim().split("\n");
  assert.equal(csv.length, 106);
  assert.match(readFileSync("docs/launch/eauctionsindia-institutions-available.txt", "utf8"), /^4 of 105/);
  assert.match(readFileSync("docs/launch/eauctionsindia-institutions-missing.txt", "utf8"), /^0 of 105/);
  assert.match(readFileSync("docs/launch/eauctionsindia-institutions-uncertain.txt", "utf8"), /^101 of 105/);
});
