import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addressRelation, decideSameProperty, exactTitleMergeAllowed, extractPin, formatMergeNote, isDistinctiveTitle, titleTokens, type IdentityFacts } from "../src/lib/pipeline/propertyIdentity";

/*
 * Deduplication hardening (Phase 3, PR 1). The rule under test: price, date and a similar title are NOT enough to call two
 * listings the same property. Evidence is a source-qualified id, the same address, or a distinctive title that no address contradicts.
 *
 * These tests were first written against the old rule (commit "dedup step 1"), where the UNSAFE cases below returned a match.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

const f = (title: string, o: { reserve?: number | null; start?: string | null; address?: string | null; id?: string | null } = {}): IdentityFacts => ({
  tokens: titleTokens(title),
  reserve: o.reserve ?? null,
  start: o.start ? new Date(o.start) : null,
  address: o.address ?? null,
  externalId: o.id ?? null,
});

const ADDR_BARGARH = "Plot No. 5171/5952, Khata No. 1333/218, Mouza Silat, Tahsil Attabira, District Bargarh, Odisha - 768111";
const ADDR_BARGARH_OTHER_FORMAT = "Plot 5171/5952 Khata 1333/218 Mouza Silat Attabira Bargarh Odisha 768111";
const ADDR_FBD_14 = "Plot No 14, Sector 24, Industrial Area, Faridabad, Haryana 121005";
const ADDR_FBD_31 = "Plot No 31, Sector 24, Industrial Area, Faridabad, Haryana 121005";
const ADDR_SURAT_A = "Shop 7, Main Road Kamrej, Surat, Gujarat 394185";
const ADDR_SURAT_B = "Shop 7, Main Road Kamrej, Surat, Gujarat 394190";

/* ---- the 13 required scenarios ---- */

test("1. a true duplicate across two sources matches on the address, whatever the titles say", () => {
  const d = decideSameProperty(f("Residential land Bargarh", { address: ADDR_BARGARH, reserve: 856_000 }), f("A Shyamu property Arapaka Ananta Laxmi", { address: ADDR_BARGARH_OTHER_FORMAT, reserve: 856_000 }));
  assert.equal(d.match, true);
  assert.equal(d.rule, "same_address");
});

test("2. the same property with slightly different titles matches when the title is distinctive (same numbers) and no address contradicts", () => {
  const d = decideSameProperty(f("Flat 12 Sunrise Apartments Sector 5 Faridabad"), f("Flat No 12 Sunrise Apartments Sector 5 Faridabad Haryana"));
  assert.equal(d.match, true);
  assert.equal(d.rule, "distinctive_title");
});

test("3. UNSAFE BEFORE: same bank, reserve and date but different addresses do not match", () => {
  const a = f("Plot in Sikri Industrial Area", { reserve: 8_311_000, start: "2026-10-13", address: "Plot 12 Sikri Industrial Area Faridabad Haryana 121102" });
  const b = f("Shops in Kamrej Surat", { reserve: 8_311_000, start: "2026-10-13", address: "Shop 3 Kamrej Surat Gujarat 394185" });
  assert.equal(decideSameProperty(a, b).match, false);
});

test("4. UNSAFE BEFORE: same reserve and date but a different PIN code never matches", () => {
  const d = decideSameProperty(f("Shop Kamrej Surat", { reserve: 520_000, start: "2026-10-29", address: ADDR_SURAT_A }), f("Shop Kamrej Surat", { reserve: 520_000, start: "2026-10-29", address: ADDR_SURAT_B }));
  assert.equal(d.match, false);
  assert.match(d.reason, /PIN/);
});

test("5. UNSAFE BEFORE: neighbouring flats in one building at one price do not match", () => {
  const a = f("Flat 101 Sunrise Apartments Sector 5 Faridabad", { reserve: 2_500_000, start: "2026-10-20", address: "Flat 101, Sunrise Apartments, Sector 5, Faridabad, Haryana 121002" });
  const b = f("Flat 102 Sunrise Apartments Sector 5 Faridabad", { reserve: 2_500_000, start: "2026-10-20", address: "Flat 102, Sunrise Apartments, Sector 5, Faridabad, Haryana 121002" });
  assert.equal(decideSameProperty(a, b).match, false);
});

test("6. UNSAFE BEFORE: two different ARCIL properties with identical title, reserve and date stay apart (different addresses, or no address at all)", () => {
  const withAddresses = decideSameProperty(
    f("Industrial property Faridabad Haryana", { reserve: 670_000, start: "2026-10-14", address: ADDR_FBD_14 }),
    f("Industrial property Faridabad Haryana", { reserve: 670_000, start: "2026-10-14", address: ADDR_FBD_31 }),
  );
  assert.equal(withAddresses.match, false);
  const noAddresses = decideSameProperty(f("Industrial property Faridabad Haryana", { reserve: 670_000, start: "2026-10-14" }), f("Industrial property Faridabad Haryana", { reserve: 670_000, start: "2026-10-14" }));
  assert.equal(noAddresses.match, false, "a generic title with the same price and day is not proof");
  assert.match(noAddresses.reason, /not enough evidence/);
});

test("7. a re-auction of the same property (same address, later date, lower reserve) matches, so a new round can be added to it", () => {
  const d = decideSameProperty(f("Residential plot Bargarh", { reserve: 770_000, start: "2026-11-20", address: ADDR_BARGARH }), f("Residential plot Bargarh Odisha", { reserve: 856_000, start: "2026-10-09", address: ADDR_BARGARH_OTHER_FORMAT }));
  assert.equal(d.match, true);
  assert.equal(d.rule, "same_address");
});

test("8. the same property with a changed reserve price still matches (price is not evidence either way)", () => {
  const d = decideSameProperty(f("Flat 12 Sunrise Apartments Sector 5 Faridabad", { reserve: 2_760_000 }), f("Flat 12 Sunrise Apartments Sector 5 Faridabad", { reserve: 2_484_000 }));
  assert.equal(d.match, true);
});

test("9. the same address in a different auction round matches (the round is added downstream, not a second property)", () => {
  const d = decideSameProperty(f("Land Mouza Silat", { start: "2026-12-01", address: ADDR_BARGARH }), f("Land Mouza Silat", { start: "2026-10-09", address: ADDR_BARGARH }));
  assert.equal(d.match, true);
});

test("10. different properties with similar names do not match", () => {
  assert.equal(decideSameProperty(f("Sunrise Heights Plot 5 Surat"), f("Sunrise Heights Plot 5 Navsari")).match, false, "different place word keeps the overlap under 80%");
  assert.equal(decideSameProperty(f("Sunrise Apartments Flat 12 Sector 5 Faridabad"), f("Sunrise Apartments Flat 21 Sector 5 Faridabad")).match, false, "different flat numbers");
  assert.equal(decideSameProperty(f("Individual House Surat", { reserve: 972_000 }), f("Individual House Surat", { reserve: 5_790_000 })).match, false, "UNSAFE BEFORE: two generic titles at different prices");
});

test("11. an explicit source-qualified id matches whatever the title says; a bare id does not count as evidence", () => {
  const a = f("Residential land Bargarh", { id: "src:arcil.co.in:shyamus-arapaka" });
  const b = f("Something entirely different", { id: "src:arcil.co.in:shyamus-arapaka" });
  const d = decideSameProperty(a, b);
  assert.equal(d.match, true);
  assert.equal(d.rule, "same_source_id");
  assert.equal(decideSameProperty(f("Flat Alpha", { id: "1234" }), f("Plot Beta", { id: "1234" })).match, false, "plain numbers from two sources can collide");
});

test("12. a missing address: only a distinctive title can match; a generic title never does", () => {
  assert.equal(decideSameProperty(f("Plot 5171 Mouza Silat Attabira Bargarh"), f("Plot 5171 Mouza Silat Attabira Bargarh Odisha")).match, true);
  assert.equal(decideSameProperty(f("Shops"), f("Shops")).match, false);
});

test("13. a missing PIN on one side is not a conflict; two different PINs are", () => {
  assert.equal(addressRelation(ADDR_SURAT_A, "Shop 7, Main Road Kamrej, Surat, Gujarat"), "match");
  assert.equal(addressRelation(ADDR_SURAT_A, ADDR_SURAT_B), "conflict");
});

/* ---- helpers ---- */

test("address relation: formatting differences match, different numbers or places do not", () => {
  assert.equal(addressRelation(ADDR_BARGARH, ADDR_BARGARH_OTHER_FORMAT), "match");
  assert.equal(addressRelation(ADDR_FBD_14, ADDR_FBD_31), "conflict");
  assert.equal(addressRelation("Surat", "Surat"), "unknown", "too short to judge");
  assert.equal(addressRelation(null, ADDR_BARGARH), "unknown");
  assert.equal(addressRelation("Kamrej Surat Gujarat Road Near Temple Bazaar Chowk", "Hospet Bellary Karnataka Fort Colony Main Bazaar Circle"), "different");
});

test("PIN extraction ignores longer numbers and numbers starting with 0", () => {
  assert.equal(extractPin("Faridabad 121005"), "121005");
  assert.equal(extractPin("Survey 12345678 Surat"), null);
  assert.equal(extractPin("Account 012345"), null);
});

test("a distinctive title needs enough words and a number", () => {
  assert.equal(isDistinctiveTitle(titleTokens("Individual House")), false);
  assert.equal(isDistinctiveTitle(titleTokens("Plot 12 Sunrise Apartments Faridabad")), true);
});

test("exact-title clean-up: generic titles and contradicting addresses are not merged; specific titles are", () => {
  assert.equal(exactTitleMergeAllowed(f("Shops"), f("Shops")), false);
  assert.equal(exactTitleMergeAllowed(f("Industrial property Faridabad Haryana", { address: ADDR_FBD_14 }), f("Industrial property Faridabad Haryana", { address: ADDR_FBD_31 })), false);
  assert.equal(exactTitleMergeAllowed(f("Flat 12 Sunrise Apartments Sector 5 Faridabad"), f("Flat 12 Sunrise Apartments Sector 5 Faridabad")), true);
});

test("the merge note names the rule, the source and the reason", () => {
  const n = formatMergeNote("same_address", "Arcil", "matched");
  assert.match(n, /^\[merge:same_address\] Arcil: matched$/);
});

/* ---- structural guards (the wiring must not quietly go back) ---- */

test("the importer decides matches through decideSameProperty and no longer uses price/date/title-only rules", () => {
  const src = read("src/lib/import/csvImport.ts");
  assert.match(src, /decideSameProperty/);
  assert.doesNotMatch(src, /legacyImportMatch/);
  assert.doesNotMatch(src, /overlap\(titleTokens, k\.tokens\) >= 0\.4/, "the weak 40% title rule is gone from the main match");
  assert.doesNotMatch(src, /overlap\(t, nt\) >= 0\.4/, "and from the last look at the database");
});

test("the scheduled clean-up has no look-alike rule and logs every hide", () => {
  const src = read("src/lib/pipeline/duplicates.ts");
  const clean = src.slice(src.indexOf("export async function autoCleanExactDuplicates"));
  assert.doesNotMatch(clean, /jaccard\(t, k\.tokens\) >= 0\.4/);
  assert.match(clean, /decideSameProperty/);
  assert.match(clean, /recordMerge/);
});

test("automatic merges are recorded through the existing PropertyChange history, with the matched rule", () => {
  const log = read("src/lib/pipeline/mergeLog.ts");
  assert.match(log, /propertyChange\.create/);
  assert.match(log, /dedup_merge/);
  assert.match(read("src/lib/import/csvImport.ts"), /recordMerge\(/);
});

test("the dedup change writes no REMOVED status and deletes nothing", () => {
  for (const file of ["src/lib/pipeline/propertyIdentity.ts", "src/lib/pipeline/mergeLog.ts", "src/lib/pipeline/duplicates.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /status:\s*"REMOVED"/, file);
    assert.doesNotMatch(src, /\.delete(Many)?\(/, file);
  }
});
