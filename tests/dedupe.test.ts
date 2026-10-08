import test from "node:test";
import assert from "node:assert/strict";
import { legacyImportMatch, titleTokens, type IdentityFacts } from "../src/lib/pipeline/propertyIdentity";

/*
 * STEP 1: characterization tests. They pin what the matching rule did BEFORE the hardening, on the extracted, unchanged
 * predicate. Cases marked UNSAFE document behaviour that wrongly treats two different properties as one (the new listing
 * is then silently skipped, or gets a re-auction round on the wrong property). Step 2 replaces this rule.
 */

const facts = (title: string, reserve: number | null, start: string | null): IdentityFacts => ({ tokens: titleTokens(title), reserve, start: start ? new Date(start) : null });

test("LEGACY: the same property from two sources (near-identical titles) matches", () => {
  assert.equal(legacyImportMatch(facts("Flat 12 Sunrise Apartments Sector 5 Faridabad", 2_760_000, "2026-10-23"), facts("Flat No 12 Sunrise Apartments Sector 5 Faridabad Haryana", 2_760_000, "2026-10-23")), true);
});

test("LEGACY: a re-auction (same title, later date, lower reserve) matches, so a round can be added", () => {
  assert.equal(legacyImportMatch(facts("Residential plot Kamrej Surat", 900_000, "2026-11-20"), facts("Residential plot Kamrej Surat", 1_000_000, "2026-10-10")), true);
});

test("LEGACY UNSAFE: same reserve and same day match even when the titles describe different places", () => {
  assert.equal(legacyImportMatch(facts("Plot in Sikri Industrial Area", 8_311_000, "2026-10-13"), facts("Shops in Kamrej Surat", 8_311_000, "2026-10-13")), true);
});

test("LEGACY UNSAFE: neighbouring flats in one building at one price match each other", () => {
  assert.equal(legacyImportMatch(facts("Flat 101 Sunrise Apartments Sector 5 Faridabad", 2_500_000, "2026-10-20"), facts("Flat 102 Sunrise Apartments Sector 5 Faridabad", 2_500_000, "2026-10-20")), true);
});

test("LEGACY UNSAFE: two different ARCIL properties with identical title, reserve and date match", () => {
  assert.equal(legacyImportMatch(facts("Industrial property Faridabad Haryana", 670_000, "2026-10-14"), facts("Industrial property Faridabad Haryana", 670_000, "2026-10-14")), true);
});

test("LEGACY UNSAFE: two generic titles match with NO other evidence at all, even at different prices", () => {
  assert.equal(legacyImportMatch(facts("Individual House Surat", 972_000, "2026-10-28"), facts("Individual House Surat", 5_790_000, "2026-11-20")), true);
});

test("LEGACY: different titles, different prices and dates do not match", () => {
  assert.equal(legacyImportMatch(facts("Shop Kamrej Surat", 520_000, "2026-10-29"), facts("Flat Palsana Surat", 780_000, "2026-10-22")), false);
});
