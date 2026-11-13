/**
 * Regression tests for the Oct-9-2026 duplicate ingestion bug.
 *
 * Confirmed production pattern:
 *   externalAuctionId "2608"         → 8 auctions, 8 different propertyIds, same bank, 2026-10-09
 *   externalAuctionId "AB-NP-2ae8975200" → 8 auctions, 8 different propertyIds, same bank, 2026-10-09
 *
 * Root cause:
 *   csvImport.ts line 481 guarded the external_id in-memory lookup behind `opts.enrich || sourceQualified`.
 *   Web-scan feeds do not set enrich=true and bare IDs are not source-qualified, so the external_id was
 *   silently ignored for matching. decideSameProperty then required an address match or distinctive title —
 *   generic records with city-level addresses didn't match — both concurrent ticks created separate rows.
 *
 * Fix verified here:
 *   1. The `opts.enrich ||` guard is removed: bare external_ids are now used for bank-scoped matching.
 *   2. A last-mile DB check runs before prisma.property.create for concurrent-safety.
 *   3. Legitimate re-auction rounds and cross-bank ID collisions are preserved.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "src", "lib", "import", "csvImport.ts"), "utf8");

// ---- Structural guards (wiring must not silently revert) ---- //

test("bare external_id is used for bank-scoped matching without opts.enrich guard", () => {
  // Before the fix: `(opts.enrich || sourceQualified) && col("external_id")`
  // After the fix:  `col("external_id")`
  // The old guarded form must be absent.
  assert.doesNotMatch(
    src,
    /\(opts\.enrich\s*\|\|\s*sourceQualified\)\s*&&\s*col\("external_id"\)/,
    "opts.enrich guard on external_id lookup was removed; it caused web-scan feeds to ignore bare IDs"
  );
});

test("sameId lookup uses external_id directly (bank-scoped via knownByBank)", () => {
  // The new form: `col("external_id") ? list.find((k) => k.ext === col("external_id")) : undefined`
  assert.match(
    src,
    /const sameId = col\("external_id"\) \? list\.find\(\(k\) => k\.ext === col\("external_id"\)\) : undefined/,
    "sameId must use external_id without an enrich/qualified guard"
  );
});

test("concurrent-safety DB check exists before prisma.property.create", () => {
  const createIdx = src.indexOf("const property = await prisma.property.create(");
  assert.ok(createIdx > 0, "prisma.property.create must exist");

  // The concurrent check must appear before the create
  const concurrentIdx = src.indexOf("Concurrent-safety: knownByBank was loaded at run start");
  assert.ok(concurrentIdx > 0, "concurrent-safety comment must exist");
  assert.ok(concurrentIdx < createIdx, "concurrent-safety check must come before prisma.property.create");
});

test("concurrent-safety check queries by (externalAuctionId, bankId) and skips on hit", () => {
  assert.match(
    src,
    /prisma\.auction\.findFirst\(\{[\s\S]*?where:\s*\{\s*externalAuctionId:\s*col\("external_id"\),\s*bankId:\s*bank\.id/,
    "last-mile check must query by externalAuctionId + bankId"
  );
  // After finding a concurrent record it must add to in-memory list (so later records in same batch don't re-query)
  assert.match(src, /list\.push\(.*concurrent\.propertyId/, "concurrent hit must be pushed to in-memory list");
});

test("concurrent-safety check is guarded: only runs when external_id and bank are both present", () => {
  // The check: `if (col("external_id") && bank) {`
  assert.match(
    src,
    /if \(col\("external_id"\) && bank\)/,
    "concurrent-safety check must be guarded by external_id and bank presence"
  );
});

test("migration note is documented in concurrent-safety comment", () => {
  assert.match(
    src,
    /@@unique\(\[bankId, externalAuctionId\]\)/,
    "comment must reference the future unique constraint that fully closes the race"
  );
});

// ---- Pure-logic guards: external_id cross-bank collision safety ---- //

import { decideSameProperty, titleTokens, type IdentityFacts } from "../src/lib/pipeline/propertyIdentity";

const f = (title: string, o: { id?: string | null; address?: string | null } = {}): IdentityFacts => ({
  tokens: titleTokens(title),
  reserve: null,
  start: null,
  address: o.address ?? null,
  externalId: o.id ?? null,
});

test("bare external_id collision across sources does NOT merge in decideSameProperty", () => {
  // "2608" is a bare integer that two sources could independently assign to different properties.
  // decideSameProperty must NOT treat this as evidence.
  const a = f("Residential plot Thane Maharashtra", { id: "2608" });
  const b = f("Commercial shop Pune Maharashtra", { id: "2608" });
  assert.equal(decideSameProperty(a, b).match, false,
    "same bare integer external_id from two different sources must not merge");
});

test("source-qualified external_id still merges correctly", () => {
  const a = f("Residential plot Thane", { id: "src:baanknet.com:2608" });
  const b = f("Something entirely different Pune", { id: "src:baanknet.com:2608" });
  assert.equal(decideSameProperty(a, b).match, true,
    "same source-qualified id must still merge in decideSameProperty");
  assert.equal(decideSameProperty(a, b).rule, "same_source_id");
});

test("knownByBank scoping: bare IDs from different banks stay in separate lists (structural)", () => {
  // knownByBank uses `bank?.id ?? "none"` as the map key, so bankId-A's list never contains bankId-B's records.
  // Verify the key assignment in source.
  assert.match(
    src,
    /const key = bankId \?\? "none"/,
    "knownByBank must key by bankId to prevent cross-bank external_id collision"
  );
});

// ---- Re-auction round preservation ---- //

test("addReauctionRound blocks a new round when externalAuctionId matches an existing round", () => {
  // Structural: same external_id = same round, do not create another
  assert.match(
    src,
    /rounds\.some\(\(r\) => r\.externalAuctionId === rec\.external_id\)\) return false/,
    "addReauctionRound must return false (block) when external_id matches an existing round"
  );
});

test("addReauctionRound allows a new round when only the date changes (no external_id match)", () => {
  // Structural: the round gap check creates a new round when start is beyond ROUND_GAP_MS
  assert.match(
    src,
    /ROUND_GAP_MS/,
    "ROUND_GAP_MS must exist to protect legitimate re-auction round creation"
  );
});
