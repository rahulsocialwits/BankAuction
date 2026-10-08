import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceBaseline,
  evaluateCompleteness,
  formatMetricsMessage,
  parseMetricsMessage,
  type HistoricalRun,
} from "../src/lib/pipeline/completeness";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5);

function history(counts: number[]): HistoricalRun[] {
  return counts.map((count, i) => ({
    startedAt: at(i + 1),
    technicalStatus: "ok",
    metrics: { inventoryCount: count, evaluationEligible: true, paginationComplete: true },
    dataStatus: "HEALTHY",
  }));
}

test("normal source run is healthy after a baseline exists", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 2050, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2100, 2050])),
  );
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.protectExistingData, false);
});

test("10% count decrease is a warning, not a failure", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 1800, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2000, 2000])),
  );
  assert.equal(result.status, "WARNING");
  assert.equal(result.protectExistingData, true);
});

test("30% count decrease is incomplete", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 1400, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2000, 2000])),
  );
  assert.equal(result.status, "INCOMPLETE");
});

test("60% count decrease is critical", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 800, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2000, 2000])),
  );
  assert.equal(result.status, "CRITICAL");
});

test("zero records against a non-zero baseline is critical", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 0, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2050, 1980])),
  );
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.countDropRatio, 1);
});

test("HTTP 200 with incomplete pagination is incomplete", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 400, httpStatus: 200, pagesFetched: 9, paginationComplete: false, evaluationEligible: true },
    buildSourceBaseline(history([2000, 2050, 1980])),
  );
  assert.equal(result.status, "INCOMPLETE");
  assert.match(result.reason, /pagination/i);
});

test("a first positive run establishes a recovering baseline instead of pretending healthy", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 2000, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline([]),
  );
  assert.equal(result.status, "RECOVERING");
});

test("incremental collectors do not receive a false completeness failure", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 100, evaluationEligible: false },
    buildSourceBaseline(history([2000, 2000, 2000])),
  );
  assert.equal(result.status, "RECOVERING");
  assert.equal(result.protectExistingData, false);
});

test("page-volume collapse is detected", () => {
  const runs = history([2000, 2000, 2000]).map((r) => ({
    ...r,
    metrics: { ...r.metrics, pagesFetched: 31, inventoryCount: 2000 },
  }));
  const result = evaluateCompleteness(
    { inventoryCount: 1800, pagesFetched: 9, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(runs),
  );
  assert.equal(result.status, "CRITICAL");
  assert.ok((result.pageDropRatio ?? 0) >= 0.6);
});

test("large rejected-record increase produces a warning", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 1000, rejectedCount: 350, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([1000, 1000, 1000])),
  );
  assert.equal(result.status, "WARNING");
  assert.match(result.reason, /rejected/i);
});

test("blocked sources are critical and preserve existing data", () => {
  const result = evaluateCompleteness(
    { blocked: true, evaluationEligible: true },
    buildSourceBaseline(history([1000, 1000, 1000])),
  );
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.protectExistingData, true);
});

test("structure change is critical and preserves data", () => {
  const result = evaluateCompleteness(
    { structureChanged: true, evaluationEligible: true },
    buildSourceBaseline(history([1000, 1000, 1000])),
  );
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.protectExistingData, true);
});

test("legitimate volume increase is healthy", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 3200, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2100, 2200])),
  );
  assert.equal(result.status, "HEALTHY");
});

test("baseline exposes previous, 7-day, 30-day and trend statistics", () => {
  const baseline = buildSourceBaseline(history([2000, 2100, 2200]));
  assert.equal(baseline.previousRunCount, 2100);
  assert.equal(baseline.median7d, 2100);
  assert.equal(baseline.min7d, 2000);
  assert.equal(baseline.max7d, 2200);
  assert.equal(baseline.median30d, 2100);
  assert.ok(baseline.recentTrend !== null);
  assert.equal(baseline.sampleCount7d, 3);
});

test("metrics are round-trippable through the existing run-log message field", () => {
  const baseline = buildSourceBaseline(history([2000, 2000, 2000]));
  const result = evaluateCompleteness(
    { inventoryCount: 400, pagesFetched: 9, paginationComplete: false, evaluationEligible: true },
    baseline,
  );
  const message = formatMetricsMessage(
    { inventoryCount: 400, pagesFetched: 9, paginationComplete: false, evaluationEligible: true },
    result,
    "HTTP 200; 400 records",
  );
  const parsed = parseMetricsMessage(message);
  assert.equal(parsed?.dataStatus, "INCOMPLETE");
  assert.equal(parsed?.metrics.inventoryCount, 400);
  assert.match(message, /HTTP 200; 400 records/);
});

test("an anomalous run never requests deletion/expiration", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 400, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([2000, 2000, 2000])),
  );
  assert.equal(result.protectExistingData, true);
});

test("recovery from an anomalous run is healthy when volume returns to baseline", () => {
  const result = evaluateCompleteness(
    { inventoryCount: 2050, evaluationEligible: true, paginationComplete: true },
    buildSourceBaseline(history([400, 2000, 2050])),
  );
  assert.equal(result.status, "HEALTHY");
});
