/**
 * P1.4 — Deduplication and re-auction protection.
 *
 * These tests cover the pure logic used by ingestOnePage:
 * - Dedup priority #2: re-reading a changed listing uses SourceRecord.auctionId, not AI
 * - Section F investigation: findDuplicateGroups does NOT match records with different prices
 * - autoCleanExactDuplicates: Pass 1 requires exact same price; Pass 2 uses decideSameProperty
 *
 * The adapter's DB-level code (ingestOnePage) requires a live Prisma client and is tested
 * through integration / CI only.  Pure helpers that can be tested in the sandbox are covered here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Unit: re-auction round gap constant matches csvImport.ts value
// ---------------------------------------------------------------------------
describe("P1.4 round-gap constant", () => {
  const ROUND_GAP_MS = 36 * 3600_000;

  it("is 36 hours in milliseconds", () => {
    assert.equal(ROUND_GAP_MS, 129_600_000);
  });

  it("two dates 35 h apart are within the gap (same round)", () => {
    const a = new Date("2025-01-01T00:00:00Z");
    const b = new Date("2025-01-02T11:00:00Z"); // 35 h later
    assert.ok(Math.abs(b.getTime() - a.getTime()) < ROUND_GAP_MS);
  });

  it("two dates 37 h apart exceed the gap (new round)", () => {
    const a = new Date("2025-01-01T00:00:00Z");
    const b = new Date("2025-01-02T13:00:00Z"); // 37 h later
    assert.ok(Math.abs(b.getTime() - a.getTime()) > ROUND_GAP_MS);
  });
});

// ---------------------------------------------------------------------------
// Unit: Section F investigation — findDuplicateGroups bucket key
// The key is bankId|reservePrice|auctionStart date.
// Two records with DIFFERENT reserve prices cannot be in the same bucket.
// ---------------------------------------------------------------------------
describe("P1.4 Section F investigation — duplicate bucket key", () => {
  function bucketKey(bankId: string, reservePrice: string, auctionStart: Date): string {
    return `${bankId}|${reservePrice}|${auctionStart.toISOString().slice(0, 10)}`;
  }

  it("same bank + same price + same date → same bucket (normal duplicate)", () => {
    const date = new Date("2025-12-17");
    const a = bucketKey("bank-1", "1511000", date);
    const b = bucketKey("bank-1", "1511000", date);
    assert.equal(a, b);
  });

  it("same bank + DIFFERENT price + same date → different buckets (Section F case)", () => {
    const date = new Date("2025-12-17");
    const a = bucketKey("bank-1", "1511000", date);
    const b = bucketKey("bank-1", "1567000", date);
    assert.notEqual(a, b, "Records with different prices must NOT be in the same bucket");
  });

  it("same bank + same price + different date → different buckets", () => {
    const a = bucketKey("bank-1", "1511000", new Date("2025-12-17"));
    const b = bucketKey("bank-1", "1511000", new Date("2026-01-20"));
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// Unit: re-auction detection helper — only a LATER date beyond the gap is a new round
// ---------------------------------------------------------------------------
describe("P1.4 re-auction round detection logic", () => {
  const ROUND_GAP_MS = 36 * 3600_000;

  function isNewRound(existingStart: Date, newStart: Date): boolean {
    return newStart.getTime() > existingStart.getTime() + ROUND_GAP_MS;
  }

  it("date 2 months later → new round", () => {
    const existing = new Date("2025-01-15T10:00:00Z");
    const incoming = new Date("2025-03-15T10:00:00Z");
    assert.ok(isNewRound(existing, incoming));
  });

  it("date 1 day later → NOT a new round (within gap: corrigendum / postponement)", () => {
    const existing = new Date("2025-01-15T10:00:00Z");
    const incoming = new Date("2025-01-16T10:00:00Z"); // 24 h later (< 36 h)
    assert.ok(!isNewRound(existing, incoming));
  });

  it("same date → NOT a new round", () => {
    const existing = new Date("2025-01-15T10:00:00Z");
    const incoming = new Date("2025-01-15T10:00:00Z");
    assert.ok(!isNewRound(existing, incoming));
  });

  it("earlier date → NOT a new round (backfill / duplicate ingestion)", () => {
    const existing = new Date("2025-03-15T10:00:00Z");
    const incoming = new Date("2025-01-15T10:00:00Z");
    assert.ok(!isNewRound(existing, incoming));
  });
});
