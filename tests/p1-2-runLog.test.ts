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
  assert.match(sql, /ALTER TABLE.*source_run_logs.*ADD COLUMN.*cursorPage/si);
  assert.match(sql, /ALTER TABLE.*source_run_logs.*ADD COLUMN.*endedAt/si);
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
