import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  baselineToAccept,
  buildSourceBaseline,
  evaluateCompleteness,
  formatMetricsMessage,
  mergeHistoricalRuns,
  parseMetricsMessage,
  refusedRunMetrics,
  type HistoricalRun,
  type SourceRunMetrics,
} from "../src/lib/pipeline/completeness";
import { allowsAutomaticRemoval, protectionFromRuns } from "../src/lib/pipeline/sourceProtection";

/*
 * Baseline hardening (Phase 3, PR 2). Rules under test:
 *  1. only HEALTHY runs (and the very first comparable pass, to seed a baseline) become baseline evidence;
 *  2. a collapse stays protected until a genuinely healthy full pass, even when the old healthy history has aged out;
 *  3. an administrator can accept a new baseline after a confirmed legitimate change in the source's size;
 *  4. a BAANKNET run that is refused before it reads anything still records a BLOCKED verdict and protection.
 * Thresholds are NOT changed here (completeness.test.ts and sourceProtection.test.ts still pin them).
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const MIN = 60_000;

/** A faithful in-memory copy of logRun + loadHistoricalRuns: evaluate against the source's own history, store the message, read it back. */
class FakeRunLog {
  rows: HistoricalRun[] = []; // newest first
  private clock = Date.now() - 500 * 60 * MIN * 24; // far enough back that "minutes apart" never reaches "now"
  /** Moves the fake clock forward by whole days (so old evidence can age out of the 7 / 30 day windows). */
  skipDays(days: number) {
    this.clock += days * 864e5;
  }
  add(metrics: SourceRunMetrics) {
    this.clock += 10 * MIN;
    const startedAt = new Date(this.clock);
    const baseline = buildSourceBaseline(this.rows, startedAt);
    const result = evaluateCompleteness(metrics, baseline);
    const parsed = parseMetricsMessage(formatMetricsMessage(metrics, result, "run"));
    assert.ok(parsed);
    this.rows.unshift({ startedAt, technicalStatus: "ok", metrics: parsed.metrics, dataStatus: parsed.dataStatus, protectExistingData: parsed.protectExistingData, recordHealth: result.recordHealth, pageHealth: result.pageHealth });
    return result;
  }
  /** What the next run would be compared against, as of the fake clock. */
  baselineNow() {
    return buildSourceBaseline(this.rows, new Date(this.clock + 10 * MIN));
  }
  protection() {
    return protectionFromRuns(this.rows);
  }
}

const fullPass = (records: number, pages = 40): SourceRunMetrics => ({ inventoryCount: records, pagesFetched: pages, evaluationEligible: true, paginationComplete: true });
const healthyLog = () => {
  const log = new FakeRunLog();
  log.add(fullPass(2000)); // first comparable pass seeds the baseline (RECOVERING)
  [2010, 1990, 2005].forEach((n) => log.add(fullPass(n)));
  return log;
};

/* ---- 1. non-HEALTHY runs are not baseline evidence ---- */

test("the first comparable full pass still seeds a baseline, so a new source can become HEALTHY (no deadlock)", () => {
  const log = new FakeRunLog();
  assert.equal(log.add(fullPass(2000)).status, "RECOVERING");
  assert.equal(log.add(fullPass(2010)).status, "HEALTHY");
});

test("REPEATED COLLAPSE cannot redefine the baseline: 200 full passes at 400 records stay CRITICAL and protected", () => {
  const log = healthyLog();
  for (let i = 0; i < 200; i++) {
    const run = log.add(fullPass(400, 8));
    assert.equal(run.status, "CRITICAL", `collapsed pass #${i + 1}`);
    assert.equal(run.protectExistingData, true);
  }
  assert.equal(log.protection().protected, true);
  const b = log.baselineNow();
  assert.ok(b.median7d !== null && b.median7d >= 1990 && b.median7d <= 2010, "the baseline is still the healthy level");
  assert.equal(b.min7d, 1990, "no collapsed count is in the baseline");
});

test("WARNING, INCOMPLETE, BLOCKED, FAILED and NO_DATA runs are not baseline evidence", () => {
  const log = healthyLog();
  const before = log.baselineNow();
  log.add(fullPass(1750, 35)); // WARNING
  log.add(fullPass(1400, 28)); // INCOMPLETE
  log.add({ blocked: true, evaluationEligible: true }); // BLOCKED
  log.add({ failedCount: 1, evaluationEligible: true, error: "boom" }); // FAILED
  log.add({ inventoryCount: 1999, pagesFetched: 40, paginationComplete: false, evaluationEligible: true }); // INCOMPLETE (pagination)
  const after = log.baselineNow();
  assert.equal(after.sampleCount7d, before.sampleCount7d);
  assert.equal(after.median7d, before.median7d);
  assert.equal(after.min7d, before.min7d);
  assert.equal(after.pageMin7d, before.pageMin7d);
});

test("the NO_DATA run of a source that first returns zero records does not seed a zero baseline", () => {
  const log = new FakeRunLog();
  assert.equal(log.add(fullPass(0, 0)).status, "NO_DATA");
  assert.equal(log.baselineNow().sampleCount7d, 0);
  assert.equal(log.add(fullPass(1500, 30)).status, "RECOVERING");
  assert.equal(log.add(fullPass(1500, 30)).status, "HEALTHY");
});

test("HEALTHY runs update the baseline (a source that really grows moves its own baseline)", () => {
  const log = healthyLog();
  for (let i = 0; i < 6; i++) assert.equal(log.add(fullPass(2100 + i * 40, 42)).status, "HEALTHY");
  const b = log.baselineNow();
  assert.ok(b.max7d !== null && b.max7d >= 2300);
  assert.ok(b.median7d !== null && b.median7d > 2005, "the median followed the healthy growth");
});

/* ---- 2. protection remains until a healthy full pass, even when the old history has aged out ---- */

test("a collapse that outlasts the 30-day window stays protected: the empty baseline does not silently become 'first run'", () => {
  const log = healthyLog();
  log.add(fullPass(400, 8)); // CRITICAL
  log.skipDays(31); // every healthy run is now older than 30 days
  const run = log.add(fullPass(400, 8));
  assert.notEqual(run.status, "HEALTHY");
  assert.equal(run.protectExistingData, true, "protection continues without a baseline to compare against");
  assert.equal(log.protection().protected, true);
  // and it keeps going on every later pass; nothing seeds a new baseline by itself
  for (let i = 0; i < 20; i++) log.add(fullPass(400, 8));
  assert.equal(log.protection().protected, true);
  assert.equal(log.baselineNow().sampleCount30d, 0, "no collapsed count became baseline evidence");
});

test("healthy evidence older than the recent-run window is kept: 60+ anomalous rows do not push the baseline out", () => {
  const healthyRows = healthyLog().rows;
  const recent: HistoricalRun[] = Array.from({ length: 70 }, (_, i) => ({
    startedAt: new Date(Date.now() - (70 - i) * MIN), // all newer than the healthy rows
    technicalStatus: "ok",
    metrics: fullPass(400, 8),
    dataStatus: "CRITICAL" as const,
    protectExistingData: true,
  }));
  const newest60 = [...recent].reverse().slice(0, 60); // what a 60-row window would load
  const withoutMerge = buildSourceBaseline(newest60);
  assert.equal(withoutMerge.sampleCount30d, 0, "a plain 60-row window has lost the healthy history");
  const merged = mergeHistoricalRuns(newest60, healthyRows.map((r) => ({ ...r, startedAt: new Date(r.startedAt.getTime() + (Date.now() - healthyRows[0].startedAt.getTime()) - 100 * MIN) })));
  const b = buildSourceBaseline(merged);
  assert.ok(b.median30d !== null && b.median30d > 1900, "merging the healthy rows back restores the reference");
});

test("mergeHistoricalRuns sorts newest first and drops the same run seen in both lists", () => {
  const a: HistoricalRun = { startedAt: new Date("2026-10-08T10:00:00Z"), technicalStatus: "ok", metrics: fullPass(2000), dataStatus: "HEALTHY" };
  const b: HistoricalRun = { startedAt: new Date("2026-10-08T11:00:00Z"), technicalStatus: "ok", metrics: fullPass(400), dataStatus: "CRITICAL", protectExistingData: true };
  const merged = mergeHistoricalRuns([b, a], [a]);
  assert.deepEqual(merged.map((r) => r.dataStatus), ["CRITICAL", "HEALTHY"]);
});

test("RECOVERY: protection clears only after a healthy full pass; incremental runs and an equal-size collapse do not clear it", () => {
  const log = healthyLog();
  log.add(fullPass(400, 8));
  log.add({ pagesFetched: 100, fetchedCount: 100, evaluationEligible: false, paginationComplete: false, pageCountComparable: false }); // incremental
  assert.equal(log.protection().protected, true);
  assert.equal(log.add(fullPass(420, 9)).status, "CRITICAL");
  assert.equal(log.protection().protected, true);
  assert.equal(log.add(fullPass(2000, 40)).status, "HEALTHY");
  assert.equal(log.protection().protected, false);
  assert.equal(allowsAutomaticRemoval(log.protection()), true);
});

test("a protective RECOVERING row (no baseline, anomaly open) counts as the latest verdict; an ordinary RECOVERING row still says nothing", () => {
  const mk = (protect: boolean): HistoricalRun[] => [
    { startedAt: new Date("2026-10-08T12:00:00Z"), technicalStatus: "ok", metrics: fullPass(400), dataStatus: "RECOVERING", protectExistingData: protect },
    { startedAt: new Date("2026-10-08T10:00:00Z"), technicalStatus: "ok", metrics: fullPass(400), dataStatus: "CRITICAL", protectExistingData: true },
  ];
  assert.equal(protectionFromRuns(mk(true)).protected, true);
  assert.equal(protectionFromRuns(mk(true)).status, "RECOVERING");
  assert.equal(protectionFromRuns(mk(false)).status, "CRITICAL", "an ordinary RECOVERING row is skipped, as before");
});

/* ---- 3. explicit baseline acceptance ---- */

test("ACCEPT: after a confirmed legitimate shrink the administrator can accept the new size; protection clears and the baseline resets", () => {
  const log = healthyLog();
  assert.equal(log.add(fullPass(1000, 20)).status, "INCOMPLETE"); // the source really halved (50% down)
  assert.equal(log.protection().protected, true);

  const pick = baselineToAccept(log.rows);
  assert.ok(pick.ok);
  assert.equal(pick.count, 1000);
  assert.equal(pick.fromStatus, "INCOMPLETE");

  const accepted = log.add(pick.metrics);
  assert.equal(accepted.status, "HEALTHY");
  assert.equal(accepted.protectExistingData, false);
  assert.equal(log.protection().protected, false);

  // the baseline is now the new size only; the old 2,000 level is not mixed in
  const b = log.baselineNow();
  assert.equal(b.median7d, 1000);
  assert.equal(b.acceptedAt !== null, true);
  assert.equal(log.add(fullPass(1010, 20)).status, "HEALTHY");
  assert.equal(log.add(fullPass(990, 20)).status, "HEALTHY");
  // and a real collapse from the NEW level is detected again
  assert.equal(log.add(fullPass(300, 6)).status, "CRITICAL");
});

test("ACCEPT: works when the old healthy history has aged out (the protective RECOVERING state)", () => {
  const log = healthyLog();
  log.add(fullPass(1000, 20));
  log.skipDays(31);
  log.add(fullPass(1000, 20));
  assert.equal(log.protection().protected, true);
  const pick = baselineToAccept(log.rows);
  assert.ok(pick.ok);
  assert.equal(log.add(pick.metrics).status, "HEALTHY");
  assert.equal(log.protection().protected, false);
  assert.equal(log.add(fullPass(1005, 20)).status, "HEALTHY");
});

test("ACCEPT is refused when it would be unsafe: blocked, failed, structure change, empty, incomplete pagination, incremental, or nothing flagged", () => {
  const refuse = (metrics: SourceRunMetrics, label: string) => {
    const log = healthyLog();
    log.add(metrics);
    assert.equal(baselineToAccept(log.rows).ok, false, label);
  };
  refuse({ blocked: true, evaluationEligible: true }, "blocked");
  refuse({ failedCount: 1, evaluationEligible: true, error: "boom" }, "failed");
  refuse({ structureChanged: true, inventoryCount: 1000, evaluationEligible: true }, "structure changed");
  refuse(fullPass(0, 0), "zero records");
  refuse({ inventoryCount: 1000, pagesFetched: 20, paginationComplete: false, evaluationEligible: true }, "pagination did not complete");
  assert.equal(baselineToAccept(healthyLog().rows).ok, false, "a healthy source has nothing to accept");
  assert.equal(baselineToAccept([]).ok, false, "no history");
});

test("ACCEPT takes the LATEST evaluated run, not an older one", () => {
  const log = healthyLog();
  log.add(fullPass(1000, 20)); // INCOMPLETE
  log.add({ blocked: true, evaluationEligible: true }); // newest evaluated run is BLOCKED
  assert.equal(baselineToAccept(log.rows).ok, false);
});

test("an accepted-baseline row carries the audit trail in its stored metrics", () => {
  const log = healthyLog();
  log.add(fullPass(1000, 20));
  const pick = baselineToAccept(log.rows);
  assert.ok(pick.ok);
  assert.equal(pick.metrics.baselineAccepted, true);
  assert.equal(pick.metrics.acceptedFromStatus, "INCOMPLETE");
  const parsed = parseMetricsMessage(formatMetricsMessage(pick.metrics, evaluateCompleteness(pick.metrics, log.baselineNow()), "accepted"));
  assert.equal(parsed?.metrics.baselineAccepted, true);
});

/* ---- 4. BAANKNET refused at start ---- */

test("REFUSED AT START: a run refused before reading anything records BLOCKED and turns protection on", () => {
  const log = healthyLog();
  const run = log.add(refusedRunMetrics("Blocked by robots.txt: nothing was requested."));
  assert.equal(run.status, "BLOCKED");
  assert.equal(run.protectExistingData, true);
  assert.equal(log.protection().protected, true);
  assert.equal(log.protection().status, "BLOCKED");
});

test("REFUSED AT START: the refusal is never baseline evidence, and one healthy full pass afterwards clears the protection", () => {
  const log = healthyLog();
  const before = log.baselineNow();
  log.add(refusedRunMetrics("Blocked by robots.txt"));
  log.add({ ...fullPass(0, 0), blocked: true, failedCount: 1 }); // refused on page 1 (401/403): counts are zero
  const mid = log.baselineNow();
  assert.equal(mid.median7d, before.median7d);
  assert.equal(mid.min7d, before.min7d, "no zero count entered the baseline");
  assert.equal(log.add(fullPass(2000, 40)).status, "HEALTHY");
  assert.equal(log.protection().protected, false);
});

test("refusedRunMetrics carries no count, so no zero can look like a measurement", () => {
  const m = refusedRunMetrics("x");
  assert.equal(m.blocked, true);
  assert.equal(m.evaluationEligible, true);
  assert.equal(m.inventoryCount, undefined);
  assert.equal(evaluateCompleteness(m, buildSourceBaseline([])).status, "BLOCKED");
});

test("BAANKNET wiring: the robots.txt early return logs metrics (not just a message)", () => {
  const src = read("src/data-sources/feeds/baanknetImport.ts");
  const early = src.slice(src.indexOf("Blocked by robots.txt"), src.indexOf("the site's own handshake"));
  assert.match(early, /refusedRunMetrics\(/);
  assert.match(early, /logRun\(/);
});

/* ---- wiring / safety guards ---- */

test("the run log loads healthy rows separately, so anomalous rows cannot push the baseline out of the window", () => {
  const src = read("src/lib/pipeline/runLog.ts");
  assert.match(src, /mergeHistoricalRuns\(/);
  assert.match(src, /"dataStatus":"HEALTHY"/);
});

test("the accept action is master-only, goes through the safe checks, and writes only a run-log row", () => {
  const actions = read("src/app/admin/(shell)/engine/actions.ts");
  const fn = actions.slice(actions.indexOf("export async function acceptBaselineAction"));
  assert.match(fn, /requireMaster\(\)/);
  assert.match(fn, /acceptNewBaseline\(/);
  const runLog = read("src/lib/pipeline/runLog.ts");
  const accept = runLog.slice(runLog.indexOf("export async function acceptNewBaseline"));
  assert.match(accept, /baselineToAccept\(/);
  assert.doesNotMatch(accept.slice(0, accept.indexOf("export", 10) > 0 ? accept.indexOf("export", 10) : undefined), /\.delete|status:\s*"REMOVED"|property\./);
});

test("baseline hardening does not change the drop thresholds", () => {
  const src = read("src/lib/pipeline/completeness.ts");
  assert.match(src, /ratio >= 0\.6\) return "CRITICAL"/);
  assert.match(src, /ratio >= 0\.3\) return "INCOMPLETE"/);
  assert.match(src, /ratio >= 0\.1\) return "WARNING"/);
});
