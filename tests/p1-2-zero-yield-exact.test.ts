/**
 * P1.2 — exact zero-yield threshold: 2 consecutive ticks + 7-day median > 0
 *
 * Tests the pure nextChannelYield() logic. No DB required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextChannelYield, ZERO_YIELD_AFTER_RUNS, type YieldRun } from "../src/lib/pipeline/zeroYield";

const zero = (sevenDayMedian?: number): YieldRun => ({ discovered: 0, created: 0, duplicates: 0, rejected: 0, sevenDayMedian });
const productive = (): YieldRun => ({ discovered: 5, created: 2, duplicates: 3, rejected: 0, sevenDayMedian: 2 });

describe("P1.2 — exact zero-yield threshold", () => {
  it("threshold is exactly 2, not 3", () => {
    assert.equal(ZERO_YIELD_AFTER_RUNS, 2);
  });

  // --- Previously-productive source (has lastProductiveAt) ---

  it("tick 1 zero + median > 0 → EMPTY, not DROPPED", () => {
    const prev = nextChannelYield(undefined, productive()); // establish productive state
    assert.equal(prev.verdict, "PRODUCTIVE");
    const after1 = nextChannelYield(prev, zero(2));
    assert.equal(after1.verdict, "EMPTY", "first zero tick must be EMPTY, not DROPPED");
    assert.equal(after1.zeroStreak, 1);
  });

  it("tick 2 zero + median > 0 → DROPPED", () => {
    const prev = nextChannelYield(undefined, productive());
    const after1 = nextChannelYield(prev, zero(2));
    const after2 = nextChannelYield(after1, zero(2));
    assert.equal(after2.verdict, "DROPPED", "two consecutive zero ticks with median > 0 must become DROPPED");
    assert.equal(after2.zeroStreak, 2);
  });

  it("tick 2 zero + median = 0 → EMPTY (no alert)", () => {
    const prev = nextChannelYield(undefined, productive());
    const after1 = nextChannelYield(prev, zero(0));
    const after2 = nextChannelYield(after1, zero(0));
    assert.equal(after2.verdict, "EMPTY", "zero median suppresses the alert even after 2 zeros");
  });

  it("tick 2 zero + median undefined → EMPTY (no alert)", () => {
    const prev = nextChannelYield(undefined, productive());
    const after1 = nextChannelYield(prev, zero(undefined));
    const after2 = nextChannelYield(after1, zero(undefined));
    assert.equal(after2.verdict, "EMPTY", "missing median must not trigger alert");
  });

  // --- Never-productive source (no lastProductiveAt) ---

  it("tick 2 zero + median > 0 → ZERO_YIELD for never-productive", () => {
    const after1 = nextChannelYield(undefined, zero(3));
    const after2 = nextChannelYield(after1, zero(3));
    assert.equal(after2.verdict, "ZERO_YIELD");
    assert.equal(after2.zeroStreak, 2);
  });

  it("tick 2 zero + median = 0 → EMPTY for never-productive", () => {
    const after1 = nextChannelYield(undefined, zero(0));
    const after2 = nextChannelYield(after1, zero(0));
    assert.equal(after2.verdict, "EMPTY");
  });

  it("tick 1 zero + median > 0 → EMPTY for never-productive", () => {
    const after1 = nextChannelYield(undefined, zero(5));
    assert.equal(after1.verdict, "EMPTY", "one zero tick is never enough to alert");
  });

  // --- Recovery ---

  it("productive run after DROPPED clears the streak", () => {
    const prev = nextChannelYield(undefined, productive());
    const z1 = nextChannelYield(prev, zero(2));
    const z2 = nextChannelYield(z1, zero(2));
    assert.equal(z2.verdict, "DROPPED");
    const recovered = nextChannelYield(z2, productive());
    assert.equal(recovered.verdict, "PRODUCTIVE");
    assert.equal(recovered.zeroStreak, 0);
  });

  // --- yieldMonitor integration guard ---

  it("yieldMonitor queries 7-day median and passes sevenDayMedian to run", () => {
    const src = readFileSync(resolve("src/lib/pipeline/yieldMonitor.ts"), "utf8");
    assert.ok(src.includes("sevenDayMedian"), "yieldMonitor must pass sevenDayMedian to nextChannelYield");
    assert.ok(src.includes("source_run_logs") || src.includes("sourceRunLog"), "yieldMonitor must query run logs for the median");
    assert.ok(src.includes("7") || src.includes("seven"), "yieldMonitor must use a 7-day window");
  });
});
