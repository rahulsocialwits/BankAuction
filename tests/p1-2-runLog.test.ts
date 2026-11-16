/**
 * P1.2 implementation tests:
 *   - RunLogInput accepts cursorPage and endedAt
 *   - Zero-yield alert suppression (pure: advanceAlertState, shouldAlert, alertStateOf, withAlertState)
 *   - Schema structural checks (cursorPage, endedAt columns in schema + migration)
 *
 * All tests are pure file-read or pure-function tests: no database, no Prisma client needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  advanceAlertState,
  alertStateOf,
  shouldAlert,
  withAlertState,
  type AlertState,
} from "../src/lib/pipeline/zeroYieldAlert";
// zeroYieldAlert.ts is pure (no Prisma). The integration layer is in zeroYieldAlertMonitor.ts.

const root = join(__dirname, "..");

// ---- schema structural checks ---- //

test("SourceRunLog schema: cursorPage column declared", () => {
  const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.match(model, /cursorPage\s+Int\?/, "cursorPage Int? must be in SourceRunLog");
});

test("SourceRunLog schema: endedAt column declared", () => {
  const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.match(model, /endedAt\s+DateTime\?/, "endedAt DateTime? must be in SourceRunLog");
});

test("P1.2 migration: ALTER TABLE adds cursorPage and endedAt", () => {
  const sql = readFileSync(join(root, "prisma", "migrations", "20261116010000_source_run_log_fields", "migration.sql"), "utf8");
  assert.ok(sql.includes('"cursorPage"') || sql.toLowerCase().includes("cursorpage"), "migration must ADD COLUMN cursorPage");
  assert.ok(sql.includes('"endedAt"') || sql.toLowerCase().includes("endedat"), "migration must ADD COLUMN endedAt");
});

test("SourceRunLog schema: kind comment includes 'alert'", () => {
  const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.match(model, /kind.*alert/, "kind comment must list 'alert' for zero-yield alert rows");
});

test("RunLogInput type: cursorPage and endedAt are declared", () => {
  const src = readFileSync(join(root, "src", "lib", "pipeline", "runLog.ts"), "utf8");
  assert.match(src, /cursorPage\?:\s*number/, "RunLogInput must have optional cursorPage");
  assert.match(src, /endedAt\?:\s*Date/, "RunLogInput must have optional endedAt");
});

test("BAANKNET importer: passes cursorPage to logRun", () => {
  const src = readFileSync(join(root, "src", "data-sources", "feeds", "baanknetImport.ts"), "utf8");
  assert.match(src, /cursorPage:\s*st\.page/, "baanknetImport must pass cursorPage: st.page to logRun");
});

// ---- zero-yield alert suppression (pure) ---- //

const noAlert: AlertState = { lastAlertedVerdict: null, lastAlertedAt: null, suppressedCount: 0 };
const now = new Date("2026-11-16T10:00:00Z");

test("shouldAlert: PRODUCTIVE verdict never fires", () => {
  assert.equal(shouldAlert("PRODUCTIVE", noAlert), false);
  assert.equal(shouldAlert(null, noAlert), false);
});

test("shouldAlert: first ZERO_YIELD fires", () => {
  assert.equal(shouldAlert("ZERO_YIELD", noAlert), true);
});

test("shouldAlert: same ZERO_YIELD after already alerted is suppressed", () => {
  const alerted: AlertState = { lastAlertedVerdict: "ZERO_YIELD", lastAlertedAt: now.toISOString(), suppressedCount: 0 };
  assert.equal(shouldAlert("ZERO_YIELD", alerted), false);
});

test("shouldAlert: DROPPED after ZERO_YIELD fires again (different verdict)", () => {
  const alerted: AlertState = { lastAlertedVerdict: "ZERO_YIELD", lastAlertedAt: now.toISOString(), suppressedCount: 2 };
  assert.equal(shouldAlert("DROPPED", alerted), true);
});

test("advanceAlertState: first ZERO_YIELD → fire + state updated", () => {
  const { newState, fire } = advanceAlertState("ZERO_YIELD", noAlert, now);
  assert.equal(fire, true);
  assert.equal(newState.lastAlertedVerdict, "ZERO_YIELD");
  assert.equal(newState.suppressedCount, 0);
  assert.equal(newState.lastAlertedAt, now.toISOString());
});

test("advanceAlertState: second ZERO_YIELD → suppressed, counter increments", () => {
  const alerted: AlertState = { lastAlertedVerdict: "ZERO_YIELD", lastAlertedAt: now.toISOString(), suppressedCount: 0 };
  const { newState, fire } = advanceAlertState("ZERO_YIELD", alerted, now);
  assert.equal(fire, false);
  assert.equal(newState.suppressedCount, 1);
});

test("advanceAlertState: recovery to PRODUCTIVE resets alert state", () => {
  const alerted: AlertState = { lastAlertedVerdict: "DROPPED", lastAlertedAt: now.toISOString(), suppressedCount: 5 };
  const { newState, fire } = advanceAlertState("PRODUCTIVE", alerted, now);
  assert.equal(fire, false);
  assert.equal(newState.lastAlertedVerdict, null);
  assert.equal(newState.suppressedCount, 0);
});

test("advanceAlertState: after recovery, next problem fires again", () => {
  const reset: AlertState = { lastAlertedVerdict: null, lastAlertedAt: null, suppressedCount: 0 };
  const { fire } = advanceAlertState("ZERO_YIELD", reset, now);
  assert.equal(fire, true);
});

test("advanceAlertState: EMPTY verdict (not a problem) does not fire", () => {
  const { fire } = advanceAlertState("EMPTY", noAlert, now);
  assert.equal(fire, false);
});

test("advanceAlertState: ALL_REJECTED fires on first occurrence", () => {
  const { fire, newState } = advanceAlertState("ALL_REJECTED", noAlert, now);
  assert.equal(fire, true);
  assert.equal(newState.lastAlertedVerdict, "ALL_REJECTED");
});

// ---- alertState serialisation ---- //

test("alertStateOf: returns empty state for null/undefined/empty", () => {
  const s = alertStateOf(null);
  assert.equal(s.lastAlertedVerdict, null);
  assert.equal(s.suppressedCount, 0);
  assert.deepEqual(alertStateOf(undefined), s);
  assert.deepEqual(alertStateOf("{}"), s);
});

test("alertStateOf / withAlertState: round-trips correctly", () => {
  const state: AlertState = { lastAlertedVerdict: "DROPPED", lastAlertedAt: now.toISOString(), suppressedCount: 3 };
  const json = withAlertState(null, state);
  const back = alertStateOf(json);
  assert.deepEqual(back, state);
});

test("withAlertState: preserves other keys in sheetState", () => {
  const existing = JSON.stringify({ yield: { site: { verdict: "PRODUCTIVE" } }, web: { importAll: false } });
  const json = withAlertState(existing, { lastAlertedVerdict: "ZERO_YIELD", lastAlertedAt: now.toISOString(), suppressedCount: 0 });
  const parsed = JSON.parse(json);
  assert.ok(parsed.yield, "yield key must be preserved");
  assert.ok(parsed.web, "web key must be preserved");
  assert.equal(parsed.alertState.lastAlertedVerdict, "ZERO_YIELD");
});

test("alertStateOf: handles malformed JSON gracefully", () => {
  const s = alertStateOf("{not valid json}");
  assert.equal(s.lastAlertedVerdict, null);
});

// ---- persistence simulation: multi-tick state machine ---- //
// These tests simulate the full sequence that the integration layer (zeroYieldAlertMonitor.ts)
// runs across multiple ticks, using in-memory state to stand in for FeedSource.sheetState.
// They verify persistence, recovery, and suppression without a live database.

function simulateTick(
  sheetState: string | null,
  verdict: ReturnType<typeof import("../src/lib/pipeline/zeroYield")["overallYield"]>,
): { sheetState: string; fired: boolean } {
  if (!verdict) return { sheetState: sheetState ?? "{}", fired: false };
  const alertState = alertStateOf(sheetState);
  const { newState, fire } = advanceAlertState(verdict, alertState);
  const nextSheet = withAlertState(sheetState, newState);
  return { sheetState: nextSheet, fired: fire };
}

test("persistence: suppression survives multiple ticks (simulated store)", () => {
  let sheet: string | null = null;
  // Tick 1: first DROPPED → alert fires
  { const r = simulateTick(sheet, "DROPPED"); sheet = r.sheetState; assert.equal(r.fired, true); }
  // Tick 2: same DROPPED → suppressed
  { const r = simulateTick(sheet, "DROPPED"); sheet = r.sheetState; assert.equal(r.fired, false); }
  // Tick 3: still DROPPED → suppressed, counter = 2
  { const r = simulateTick(sheet, "DROPPED"); sheet = r.sheetState; assert.equal(r.fired, false); }
  const state = alertStateOf(sheet);
  assert.equal(state.suppressedCount, 2);
  assert.equal(state.lastAlertedVerdict, "DROPPED");
});

test("recovery: PRODUCTIVE resets state; subsequent problem fires again", () => {
  let sheet: string | null = null;
  // Enter ZERO_YIELD
  { const r = simulateTick(sheet, "ZERO_YIELD"); sheet = r.sheetState; assert.equal(r.fired, true); }
  // Suppress once
  { const r = simulateTick(sheet, "ZERO_YIELD"); sheet = r.sheetState; assert.equal(r.fired, false); }
  // Recover to PRODUCTIVE — this is the path that was broken (not calling notifyZeroYield for PRODUCTIVE)
  { const r = simulateTick(sheet, "PRODUCTIVE"); sheet = r.sheetState; assert.equal(r.fired, false); }
  // State must be reset
  const state = alertStateOf(sheet);
  assert.equal(state.lastAlertedVerdict, null, "recovery must clear lastAlertedVerdict");
  assert.equal(state.suppressedCount, 0, "recovery must reset suppressedCount");
  // Problem again after recovery → fires again
  { const r = simulateTick(sheet, "DROPPED"); sheet = r.sheetState; assert.equal(r.fired, true); }
});

test("concurrent suppression: second concurrent tick sees same state and fires duplicate without lock", () => {
  // This test documents the race: two ticks reading the same (pre-fire) state would both fire.
  // The fix is SELECT FOR UPDATE in zeroYieldAlertMonitor.ts.
  const sheet: string | null = null; // shared state before either tick writes
  const r1 = simulateTick(sheet, "ZERO_YIELD");
  const r2 = simulateTick(sheet, "ZERO_YIELD"); // reads SAME initial state: also fires
  assert.equal(r1.fired, true, "tick 1 fires");
  assert.equal(r2.fired, true, "tick 2 also fires when reading stale state (the race)");
  // With SELECT FOR UPDATE the second tick reads r1's written state and suppresses
  const r3 = simulateTick(r1.sheetState, "ZERO_YIELD"); // reads post-tick-1 state
  assert.equal(r3.fired, false, "tick 2 with updated state correctly suppresses");
});

test("monitor call path: yieldMonitor calls notifyZeroYield for PRODUCTIVE", () => {
  // Verify the source code fix: yieldMonitor.ts must call notifyZeroYield even for non-problem verdicts
  const src = readFileSync(join(root, "src", "lib", "pipeline", "yieldMonitor.ts"), "utf8");
  // The old broken code had: overall !== "PRODUCTIVE" && overall !== "EMPTY"
  assert.doesNotMatch(
    src,
    /overall !== ["']PRODUCTIVE["']/,
    "yieldMonitor must NOT gate notifyZeroYield on overall !== PRODUCTIVE (recovery path broken)",
  );
  // The fixed code calls notifyZeroYield for all non-null verdicts
  assert.match(src, /notifyZeroYield/, "yieldMonitor must import and call notifyZeroYield");
});

test("zeroYieldAlertMonitor: uses SELECT FOR UPDATE for concurrency safety", () => {
  const src = readFileSync(join(root, "src", "lib", "pipeline", "zeroYieldAlertMonitor.ts"), "utf8");
  assert.match(src, /FOR UPDATE/, "notifyZeroYield must use SELECT FOR UPDATE to prevent concurrent duplicate alerts");
  assert.match(src, /\$transaction/, "notifyZeroYield must use a transaction");
});
