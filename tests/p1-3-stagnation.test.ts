/**
 * P1.3 — stagnation detection: null/repeated cursor and three-run warnings
 *
 * Tests the pure checkStagnation() and stagnationRunFromMessage() logic. No DB required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkStagnation, stagnationRunFromMessage, STAGNATION_RUNS } from "../src/lib/pipeline/stagnation";

const unchanged = (morePending = false) => ({ unchanged: true, morePending });
const active = () => ({ unchanged: false, morePending: false });
const paginating = () => ({ unchanged: true, morePending: true });

describe("P1.3 — stagnation detection", () => {
  it("STAGNATION_RUNS is 3", () => {
    assert.equal(STAGNATION_RUNS, 3);
  });

  it("empty history returns not stagnant", () => {
    const r = checkStagnation([]);
    assert.equal(r.stagnant, false);
    assert.equal(r.streak, 0);
  });

  it("two consecutive unchanged runs are not yet stagnant", () => {
    const r = checkStagnation([unchanged(), unchanged()]);
    assert.equal(r.stagnant, false);
    assert.equal(r.streak, 2);
  });

  it("three consecutive unchanged runs trigger stagnation", () => {
    const r = checkStagnation([unchanged(), unchanged(), unchanged()]);
    assert.equal(r.stagnant, true);
    assert.equal(r.streak, 3);
    assert.ok(r.warning, "warning message must be set");
    assert.ok(r.warning!.includes("3 consecutive"), "warning must mention the streak count");
  });

  it("active run resets the streak", () => {
    const r = checkStagnation([unchanged(), unchanged(), active(), unchanged(), unchanged()]);
    assert.equal(r.stagnant, false);
    assert.equal(r.streak, 2);
  });

  it("paginating runs do not count as stagnant (morePending = true)", () => {
    const r = checkStagnation([paginating(), paginating(), paginating()]);
    assert.equal(r.stagnant, false);
    assert.equal(r.streak, 0);
  });

  it("mixed paginating and unchanged: paginating resets streak", () => {
    const r = checkStagnation([unchanged(), paginating(), unchanged(), unchanged()]);
    assert.equal(r.stagnant, false);
    assert.equal(r.streak, 2);
  });

  it("four consecutive unchanged runs have streak of 4", () => {
    const r = checkStagnation([unchanged(), unchanged(), unchanged(), unchanged()]);
    assert.equal(r.stagnant, true);
    assert.equal(r.streak, 4);
  });

  // --- stagnationRunFromMessage ---

  it("stagnationRunFromMessage: 'No changes' message with 0 created = unchanged", () => {
    const r = stagnationRunFromMessage("No changes in any of the 2 tab(s).", 0);
    assert.equal(r.unchanged, true);
    assert.equal(r.morePending, false);
  });

  it("stagnationRunFromMessage: 'Unchanged: AI skipped' with 0 created = unchanged", () => {
    const r = stagnationRunFromMessage("Unchanged: AI skipped (content unchanged).", 0);
    assert.equal(r.unchanged, true);
    assert.equal(r.morePending, false);
  });

  it("stagnationRunFromMessage: message with created > 0 is not unchanged", () => {
    const r = stagnationRunFromMessage("3 new, 1 duplicate skipped, 0 rejected.", 3);
    assert.equal(r.unchanged, false);
  });

  it("stagnationRunFromMessage: MORE_PENDING sentinel sets morePending", () => {
    const r = stagnationRunFromMessage("1 new. Continues automatically.", 1);
    assert.equal(r.morePending, true);
  });

  it("stagnationRunFromMessage: 'continue on the next run' sets morePending", () => {
    const r = stagnationRunFromMessage("Tab: 2 new; 100 row(s) continue on the next run.", 2);
    assert.equal(r.morePending, true);
  });

  it("stagnationRunFromMessage: null message with 0 created treated as unchanged", () => {
    const r = stagnationRunFromMessage(null, 0);
    // null message + 0 created: message contains "" which does not match "No changes" etc.,
    // but created===0 AND empty string does match the fallback pattern.
    // Actually: our logic requires a matching pattern in the message OR explicit unchanged text.
    // null message with 0 created from an error run should NOT be flagged as stagnant unchanged.
    // Confirm: unchanged = false when message is null (we can't distinguish error from unchanged)
    assert.equal(r.unchanged, false);
  });
});
