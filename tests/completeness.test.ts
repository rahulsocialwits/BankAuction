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

// ---------------------------------------------------------------------------------------------------------------------
// Phase 2 final hardening: record counts and page counts are different units and keep SEPARATE baselines.
// ---------------------------------------------------------------------------------------------------------------------

/** History where every run has both a record count and a page count (a BAANKNET-shaped source: 50 records per page). */
function historyWithPages(counts: number[], pages: number[]): HistoricalRun[] {
  return counts.map((count, i) => ({
    startedAt: at(i + 1),
    technicalStatus: "ok",
    metrics: { inventoryCount: count, pagesFetched: pages[i], evaluationEligible: true, paginationComplete: true },
    dataStatus: "HEALTHY" as const,
  }));
}
const baanknetBaseline = () => buildSourceBaseline(historyWithPages([2000, 2000, 2000], [40, 40, 40]));
const baanknetRun = (records: number, pages: number) => ({ inventoryCount: records, pagesFetched: pages, paginationTotalPages: pages, evaluationEligible: true, paginationComplete: true });

test("REGRESSION: 2,000 records over 40 pages is healthy when history is 2,000 records / 40 pages", () => {
  const result = evaluateCompleteness(baanknetRun(2000, 40), baanknetBaseline());
  assert.equal(result.recordHealth, "HEALTHY");
  assert.equal(result.pageHealth, "HEALTHY");
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.protectExistingData, false);
  assert.equal(result.pageDropRatio, 0);
});

test("record baseline and page baseline are built from their own history and never mixed", () => {
  const baseline = baanknetBaseline();
  assert.equal(baseline.median7d, 2000, "record baseline comes from record counts");
  assert.equal(baseline.pageMedian7d, 40, "page baseline comes from page counts");
  assert.equal(baseline.pageMin7d, 40);
  assert.equal(baseline.pageMax7d, 40);
  assert.equal(baseline.pageSampleCount7d, 3);
  // record-only history must not create a page baseline, and pages must not be judged against records
  const recordsOnly = buildSourceBaseline(history([2000, 2000, 2000]));
  assert.equal(recordsOnly.pageMedian7d, null);
  const result = evaluateCompleteness(baanknetRun(2000, 40), recordsOnly);
  assert.equal(result.pageHealth, null, "no page history = page check not evaluated");
  assert.equal(result.status, "HEALTHY", "never 'pages dropped 98%' from comparing 40 pages with 2,000 records");
});

test("2,000 records over 20 pages (from 40) is a page anomaly even though the record count is healthy", () => {
  const result = evaluateCompleteness(baanknetRun(2000, 20), baanknetBaseline());
  assert.equal(result.recordHealth, "HEALTHY");
  assert.equal(result.pageHealth, "INCOMPLETE");
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.protectExistingData, true);
  assert.match(result.reason, /page-count baseline/);
});

test("2,000 records over 2 pages (from 40) is a critical page anomaly", () => {
  const result = evaluateCompleteness(baanknetRun(2000, 2), baanknetBaseline());
  assert.equal(result.recordHealth, "HEALTHY");
  assert.equal(result.pageHealth, "CRITICAL");
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.protectExistingData, true);
});

test("0 pages (from 40) is critical", () => {
  const result = evaluateCompleteness(baanknetRun(2000, 0), baanknetBaseline());
  assert.equal(result.pageHealth, "CRITICAL");
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.pageDropRatio, 1);
});

test("a 2,000 -> 400 record collapse is CRITICAL on the record check and protects existing data", () => {
  const result = evaluateCompleteness(baanknetRun(400, 8), baanknetBaseline());
  assert.equal(result.recordHealth, "CRITICAL");
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.protectExistingData, true);
  assert.ok((result.countDropRatio ?? 0) >= 0.79);
});

test("page check is skipped when the collector says its page count is not comparable", () => {
  const history = historyWithPages([2000, 2000, 2000], [40, 40, 40]).map((r) => ({ ...r, metrics: { ...r.metrics, pageCountComparable: false } }));
  const baseline = buildSourceBaseline(history);
  assert.equal(baseline.pageMedian7d, null);
  const result = evaluateCompleteness({ ...baanknetRun(2000, 2), pageCountComparable: false }, baseline);
  assert.equal(result.pageHealth, null);
  assert.equal(result.status, "HEALTHY");
});

test("page check is skipped when the source's own page counts are too unstable for a percentage test", () => {
  const unstable = buildSourceBaseline(historyWithPages([2000, 2000, 2000], [10, 40, 25]));
  assert.equal(evaluateCompleteness(baanknetRun(2000, 5), unstable).pageHealth, null);
  const tooFew = buildSourceBaseline(historyWithPages([2000], [40]));
  assert.equal(evaluateCompleteness(baanknetRun(2000, 5), tooFew).pageHealth, null, "one page sample is not a baseline");
});

test("BankAuctions.in: an incremental run is never judged as a full inventory", () => {
  // shape reported by adapter.ts for a routine 100-page tick: not eligible, no inventory count
  const incremental = { inventoryCount: undefined, pagesFetched: 100, fetchedCount: 100, evaluationEligible: false, paginationComplete: false, pageCountComparable: false };
  const result = evaluateCompleteness(incremental, buildSourceBaseline(history([2000, 2000, 2000])));
  assert.equal(result.status, "RECOVERING");
  assert.equal(result.protectExistingData, false);
  assert.equal(result.recordHealth, null);
  assert.equal(result.pageHealth, null);
});

test("BankAuctions.in: the last tick of a complete Import-all pass is judged on the sitemap size, not on its leftover page count", () => {
  const passHistory = history([2000, 2000, 2000]).map((r) => ({ ...r, metrics: { ...r.metrics, pagesFetched: 700, pageCountComparable: false } }));
  // final tick of the pass read only the 12 pages that were left
  const finalTick = { inventoryCount: 2000, pagesFetched: 12, pageCountComparable: false, evaluationEligible: true, paginationComplete: true };
  const result = evaluateCompleteness(finalTick, buildSourceBaseline(passHistory));
  assert.equal(result.status, "HEALTHY");
  // but a real collapse of the sitemap is still caught on the record check
  const collapsed = evaluateCompleteness({ ...finalTick, inventoryCount: 400 }, buildSourceBaseline(passHistory));
  assert.equal(collapsed.status, "CRITICAL");
});

test("the stored header stays valid JSON even with every metric set and a very long human message", () => {
  const metrics = {
    inventoryCount: 2000, discoveredCount: 2000, fetchedCount: 2000, parsedCount: 2000, validCount: 2000, publishedCount: 50, updatedCount: 10,
    unchangedCount: 1900, duplicateCount: 30, rejectedCount: 10, failedCount: 0, documentCount: 500, mediaCount: 900, pagesDiscovered: 40,
    pagesFetched: 40, pagesFailed: 0, paginationTotalPages: 40, paginationComplete: true, coverageComplete: true, evaluationEligible: true,
    pageCountComparable: true, httpStatus: 200, apiStatus: "ok", error: "x".repeat(5000),
  };
  const result = evaluateCompleteness(metrics, baanknetBaseline());
  const message = formatMetricsMessage(metrics, result, "human text ".repeat(500));
  assert.ok(message.length <= 2000);
  const parsed = parseMetricsMessage(message);
  assert.ok(parsed, "header must still parse after truncation");
  assert.equal(parsed?.dataStatus, "HEALTHY");
  assert.equal(parsed?.protectExistingData, false);
  assert.equal(parsed?.metrics.inventoryCount, 2000);
});

test("protectExistingData is stored in the run record, not only computed", () => {
  const result = evaluateCompleteness(baanknetRun(400, 8), baanknetBaseline());
  const parsed = parseMetricsMessage(formatMetricsMessage(baanknetRun(400, 8), result, ""));
  assert.equal(parsed?.protectExistingData, true);
  assert.equal(parsed?.dataStatus, "CRITICAL");
});
