import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSourceBaseline,
  evaluateCompleteness,
  formatMetricsMessage,
  parseMetricsMessage,
  type HistoricalRun,
  type SourceRunMetrics,
} from "../src/lib/pipeline/completeness";
import {
  allowsAutomaticRemoval,
  allowsDisappearanceAction,
  protectionFromRuns,
  removeListingIfSourceTrusted,
  sourceNameFromStatusSource,
  unreadableProtection,
  type RemovalRequest,
  type RemovalStore,
} from "../src/lib/pipeline/sourceProtection";
import { deriveAuctionStatusFromDates } from "../src/lib/domain/deriveAuctionStatus";

/**
 * A faithful in-memory copy of what logRun + getSourceProtection do, minus the database:
 * every run is evaluated against the source's own history, written as a run-log message, and read back by parsing that message.
 */
class FakeRunLog {
  rows: HistoricalRun[] = []; // newest first
  private day = 0;
  add(metrics: SourceRunMetrics) {
    this.day += 0.01; // runs are minutes apart, newest has the smallest age
    const startedAt = new Date(Date.now() - (1000 - this.day * 100) * 60_000);
    const baseline = buildSourceBaseline(this.rows, startedAt);
    const result = evaluateCompleteness(metrics, baseline);
    const parsed = parseMetricsMessage(formatMetricsMessage(metrics, result, "run"));
    assert.ok(parsed);
    this.rows.unshift({ startedAt, technicalStatus: "ok", metrics: parsed.metrics, dataStatus: parsed.dataStatus, protectExistingData: parsed.protectExistingData });
    return result;
  }
  protection() {
    return protectionFromRuns(this.rows);
  }
}

const fullPass = (records: number, pages = 40): SourceRunMetrics => ({ inventoryCount: records, pagesFetched: pages, evaluationEligible: true, paginationComplete: true });
const incremental = (): SourceRunMetrics => ({ pagesFetched: 100, fetchedCount: 100, evaluationEligible: false, paginationComplete: false, pageCountComparable: false });

class MemoryStore implements RemovalStore {
  listings = new Map<string, { status: string; changes: string[] }>();
  constructor(ids: string[]) {
    for (const id of ids) this.listings.set(id, { status: "PUBLISHED", changes: [] });
  }
  async hide(req: RemovalRequest) {
    const l = this.listings.get(req.propertyId)!;
    l.status = "REMOVED";
    l.changes.push(`${req.field}: ${req.reason}`);
  }
  statuses() {
    return [...this.listings.values()].map((l) => l.status);
  }
}
const request = (id: string): RemovalRequest => ({ propertyId: id, field: "thin_fix", reason: "Hidden: its own page states no reserve price" });
const healthyLog = () => {
  const log = new FakeRunLog();
  [2000, 2010, 1990].forEach((n) => log.add(fullPass(n)));
  return log;
};

test("a healthy source does not block automatic removal (existing behaviour is unchanged)", async () => {
  const log = healthyLog();
  const p = log.protection();
  assert.equal(p.protected, false);
  assert.equal(p.status, "HEALTHY");
  const store = new MemoryStore(["a", "b"]);
  assert.deepEqual(await removeListingIfSourceTrusted(store, p, request("a")), { applied: true });
  assert.deepEqual(store.statuses(), ["REMOVED", "PUBLISHED"]);
});

test("WRITE LAYER: an anomalous source run (2,000 -> 400 records) cannot remove existing healthy records", async () => {
  const log = healthyLog();
  const run = log.add(fullPass(400, 8));
  assert.equal(run.status, "CRITICAL");
  const store = new MemoryStore(["a", "b", "c", "d", "e"]);
  for (const id of store.listings.keys()) {
    const outcome = await removeListingIfSourceTrusted(store, log.protection(), request(id));
    assert.equal(outcome.applied, false);
  }
  assert.deepEqual(store.statuses(), ["PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED"]);
  assert.equal([...store.listings.values()].flatMap((l) => l.changes).length, 0, "nothing was written");
});

test("WRITE LAYER: INCOMPLETE, WARNING, BLOCKED, FAILED and structure-change runs also protect", async () => {
  const cases: [string, SourceRunMetrics][] = [
    ["INCOMPLETE (30% drop)", fullPass(1400, 28)],
    ["WARNING (10% drop)", fullPass(1750, 35)],
    ["BLOCKED", { blocked: true, evaluationEligible: true }],
    ["FAILED", { failedCount: 1, evaluationEligible: true, error: "boom" }],
    ["structure changed", { structureChanged: true, evaluationEligible: true }],
    ["pagination did not complete", { inventoryCount: 1999, pagesFetched: 40, paginationComplete: false, evaluationEligible: true }],
    ["page collapse with healthy records", fullPass(2000, 2)],
  ];
  for (const [name, metrics] of cases) {
    const log = healthyLog();
    log.add(metrics);
    const store = new MemoryStore(["x"]);
    const outcome = await removeListingIfSourceTrusted(store, log.protection(), request("x"));
    assert.equal(outcome.applied, false, name);
    assert.equal(store.statuses()[0], "PUBLISHED", name);
  }
});

test("RECOVERY: protection clears only after a later evaluated run is healthy; incremental runs do not clear it", async () => {
  const log = healthyLog();
  log.add(fullPass(400, 8));
  assert.equal(log.protection().protected, true);

  // routine incremental runs follow: they carry no verdict and must NOT silently clear the protection
  log.add(incremental());
  log.add(incremental());
  assert.equal(log.protection().protected, true);
  assert.equal(log.protection().status, "CRITICAL");

  // the source recovers on its next complete pass
  const recovery = log.add(fullPass(2000, 40));
  assert.equal(recovery.status, "HEALTHY");
  const p = log.protection();
  assert.equal(p.protected, false);
  const store = new MemoryStore(["a"]);
  assert.deepEqual(await removeListingIfSourceTrusted(store, p, request("a")), { applied: true });
});

test("incremental BankAuctions.in runs on their own neither protect nor clear anything", () => {
  const log = new FakeRunLog();
  log.add(incremental());
  log.add(incremental());
  const p = log.protection();
  assert.equal(p.protected, false);
  assert.equal(p.status, null);
  assert.equal(p.basis, "none");
});

test("a source with no history is not protected (nothing indicates an anomaly), but is not 'trusted' for disappearance actions either", () => {
  const p = protectionFromRuns([]);
  assert.equal(allowsAutomaticRemoval(p), true);
  assert.equal(allowsDisappearanceAction(p), false, "a future disappearance action needs a positive HEALTHY verdict");
});

test("future disappearance actions need a positive HEALTHY verdict and nothing else is enough", () => {
  const healthy = healthyLog().protection();
  assert.equal(allowsDisappearanceAction(healthy), true);
  const log = healthyLog();
  log.add(fullPass(400, 8));
  assert.equal(allowsDisappearanceAction(log.protection()), false);
  const recovering = new FakeRunLog();
  recovering.add(fullPass(2000)); // first comparable run: RECOVERING, no baseline yet
  assert.equal(recovering.protection().protected, false);
  assert.equal(allowsDisappearanceAction(recovering.protection()), false);
});

test("if the run history cannot be read the gate fails CLOSED", async () => {
  const p = unreadableProtection(new Error("connection refused"));
  assert.equal(p.protected, true);
  assert.equal(p.basis, "unreadable");
  const store = new MemoryStore(["a"]);
  assert.equal((await removeListingIfSourceTrusted(store, p, request("a"))).applied, false);
  assert.deepEqual(store.statuses(), ["PUBLISHED"]);
});

test("rows written before the flag existed fall back to the verdict", () => {
  const legacy = (dataStatus: HistoricalRun["dataStatus"]): HistoricalRun[] => [
    { startedAt: new Date(), technicalStatus: "ok", metrics: {}, dataStatus },
  ];
  assert.equal(protectionFromRuns(legacy("CRITICAL")).protected, true);
  assert.equal(protectionFromRuns(legacy("INCOMPLETE")).protected, true);
  assert.equal(protectionFromRuns(legacy("HEALTHY")).protected, false);
});

test("statusSource 'feed:<name>' maps to the run-log source name", () => {
  assert.equal(sourceNameFromStatusSource("feed:BAANKNET"), "BAANKNET");
  assert.equal(sourceNameFromStatusSource("feed:My Bank Source"), "My Bank Source");
  assert.equal(sourceNameFromStatusSource(null), null);
  assert.equal(sourceNameFromStatusSource(""), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Normal auction-date lifecycle is a separate concern and must keep working whatever the source health is.
// ---------------------------------------------------------------------------------------------------------------------
test("NORMAL EXPIRATION STILL WORKS: an auction whose date has passed is COMPLETED, independent of source health", () => {
  const past = new Date(Date.now() - 3 * 864e5);
  const future = new Date(Date.now() + 5 * 864e5);
  assert.equal(deriveAuctionStatusFromDates(past, null), "COMPLETED");
  assert.equal(deriveAuctionStatusFromDates(past, new Date(past.getTime() + 3_600_000)), "COMPLETED");
  assert.equal(deriveAuctionStatusFromDates(future, null), "UPCOMING");
  assert.equal(deriveAuctionStatusFromDates(new Date(Date.now() - 600_000), new Date(Date.now() + 600_000)), "LIVE");
});

test("date-based status derivation does not depend on the data-protection modules (so anomalies cannot disable it)", () => {
  const src = readFileSync(join(__dirname, "..", "src/lib/domain/deriveAuctionStatus.ts"), "utf8");
  assert.doesNotMatch(src, /completeness|sourceProtection|sourceRemoval|runLog/);
  assert.equal(deriveAuctionStatusFromDates.length >= 2, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// Structural guard: the two automatic paths that hide a listing because of what a source returned must use the gate.
// ---------------------------------------------------------------------------------------------------------------------
test("thinFix.ts and csvImport.ts no longer write status REMOVED directly: they go through removeListingFromSource", () => {
  for (const file of ["src/lib/pipeline/thinFix.ts", "src/lib/import/csvImport.ts"]) {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(src, /status:\s*"REMOVED"/, `${file} must not write REMOVED directly`);
    assert.match(src, /removeListingFromSource\(/, `${file} must call the guarded removal`);
  }
  const gate = readFileSync(join(__dirname, "..", "src/lib/pipeline/sourceRemoval.ts"), "utf8");
  assert.match(gate, /getSourceProtection\(/);
  assert.match(gate, /removeListingIfSourceTrusted\(/);
});

test("the run log reads the stored verdict back (history carries protectExistingData into the gate)", () => {
  const src = readFileSync(join(__dirname, "..", "src/lib/pipeline/runLog.ts"), "utf8");
  assert.match(src, /protectExistingData: parsed\.protectExistingData/);
  assert.match(src, /protectionFromRuns\(/);
  assert.match(src, /unreadableProtection\(/);
});

// ---------------------------------------------------------------------------------------------------------------------
// BankAuctions.in: incremental runs still see the whole sitemap and must catch an index collapse.
// ---------------------------------------------------------------------------------------------------------------------
const incrementalWithIndex = (indexNow: number, lastHealthy?: number): SourceRunMetrics => ({
  ...incremental(),
  discoveredCount: indexNow,
  sitemapReferenceCount: lastHealthy,
});

test("INDEX WATCH: an incremental run whose sitemap collapsed (2,000 -> 400) is CRITICAL and protects existing data", async () => {
  const log = healthyLog();
  const run = log.add(incrementalWithIndex(400, 2000));
  assert.equal(run.status, "CRITICAL");
  assert.equal(run.protectExistingData, true);
  assert.equal(log.protection().protected, true);
  const store = new MemoryStore(["a"]);
  assert.equal((await removeListingIfSourceTrusted(store, log.protection(), request("a"))).applied, false);
  assert.deepEqual(store.statuses(), ["PUBLISHED"]);
});

test("INDEX WATCH: thresholds match the full-pass ones (10% WARNING, 30% INCOMPLETE, 60% CRITICAL)", () => {
  const verdict = (now: number) => new FakeRunLog().add(incrementalWithIndex(now, 2000)).status;
  assert.equal(verdict(1799), "WARNING");
  assert.equal(verdict(1399), "INCOMPLETE");
  assert.equal(verdict(799), "CRITICAL");
});

test("INDEX WATCH: a normal sitemap, a growing sitemap, or no reference leaves incremental runs as RECOVERING (no verdict)", () => {
  for (const m of [incrementalWithIndex(2000, 2000), incrementalWithIndex(1900, 2000), incrementalWithIndex(2300, 2000), incrementalWithIndex(400, undefined), incrementalWithIndex(0, undefined)]) {
    const run = new FakeRunLog().add(m);
    assert.equal(run.status, "RECOVERING");
    assert.equal(run.protectExistingData, false);
  }
});

test("INDEX WATCH: the reference is the last healthy full pass, so a collapse that persists does NOT become the new normal", () => {
  const log = healthyLog();
  for (let i = 0; i < 100; i++) {
    const run = log.add(incrementalWithIndex(400, 2000)); // adapter keeps passing the last HEALTHY inventory
    assert.equal(run.status, "CRITICAL");
  }
  assert.equal(log.protection().protected, true);
});

test("INDEX WATCH: protection clears only after a later evaluated healthy full pass", () => {
  const log = healthyLog();
  log.add(incrementalWithIndex(400, 2000));
  log.add(incrementalWithIndex(2000, 2000)); // sitemap back, but an incremental run carries no clearing verdict
  assert.equal(log.protection().protected, true);
  assert.equal(log.add(fullPass(2000, 40)).status, "HEALTHY");
  assert.equal(log.protection().protected, false);
});

test("INDEX WATCH wiring: adapter passes sitemapReferenceCount from the last healthy full pass", () => {
  const adapter = readFileSync(join(__dirname, "..", "src/data-sources/bankauctions/adapter.ts"), "utf8");
  assert.match(adapter, /getLastHealthyInventory\("BankAuctions\.in"\)/);
  assert.match(adapter, /sitemapReferenceCount,/);
  const runLog = readFileSync(join(__dirname, "..", "src/lib/pipeline/runLog.ts"), "utf8");
  assert.match(runLog, /"dataStatus":"HEALTHY"/);
  assert.match(runLog, /"evaluationEligible":true/);
});
