import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MISSING_PASSES,
  disappearanceGate,
  markSeen,
  runDisappearanceSweep,
  type LastSeenStore,
  type MissingState,
  type SweepCandidate,
} from "../src/lib/pipeline/lastSeen";
import { protectionFromRuns, unreadableProtection, type SourceProtection } from "../src/lib/pipeline/sourceProtection";
import type { DataHealthStatus, SourceRunMetrics } from "../src/lib/pipeline/completeness";

/*
 * Last-seen / disappearance tracking (Phase 3, PR 4). FLAG-ONLY.
 *   SOURCE HEALTHY -> LISTING NOT SEEN -> DISAPPEARANCE FLAG -> ADMIN REVIEW -> (future) controlled action
 *   never: SOURCE ERROR -> LISTING NOT SEEN -> REMOVE
 * Nothing here changes a listing: the only writes are the tracking rows themselves.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const SRC = "BAANKNET";
const day = (n: number) => new Date(Date.UTC(2026, 9, 1, 6, 0, 0) + n * 864e5);

/** In-memory twin of the Prisma store. */
class MemoryStore implements LastSeenStore {
  seen = new Map<string, Date>(); // propertyId -> last seen
  state = new Map<string, MissingState>();
  audits: { propertyId: string; field: string; note: string }[] = [];
  statusWrites = 0; // would be incremented by any listing change: must stay 0
  async touch(_source: string, ids: string[], now: Date) {
    for (const id of ids) this.seen.set(id, now);
  }
  async flaggedAmong(_source: string, ids: string[]) {
    return ids.filter((id) => this.state.get(id)?.flagged);
  }
  async candidates(): Promise<SweepCandidate[]> {
    return [...this.seen.entries()].map(([propertyId, lastSeenAt]) => ({ propertyId, lastSeenAt, missing: this.state.get(propertyId) ?? null }));
  }
  async saveState(_source: string, propertyId: string, s: MissingState) {
    this.state.set(propertyId, s);
  }
  async audit(propertyId: string, field: string, note: string) {
    this.audits.push({ propertyId, field, note });
  }
}

const healthy = (passStart: Date): { metrics: SourceRunMetrics; dataStatus: DataHealthStatus; protection: SourceProtection } => ({
  metrics: { inventoryCount: 2000, evaluationEligible: true, paginationComplete: true, passStartedAt: passStart.toISOString() },
  dataStatus: "HEALTHY",
  protection: { protected: false, status: "HEALTHY", reason: "", evaluatedAt: null, basis: "verdict" },
});

/** One complete source pass starting at `start`: the listed ids are seen during it. */
async function pass(store: MemoryStore, start: Date, seenIds: string[], gate = healthy(start), opts: { threshold?: number } = {}) {
  await markSeen(store, SRC, seenIds, new Date(start.getTime() + 3600_000));
  return runDisappearanceSweep(store, SRC, gate, { now: new Date(start.getTime() + 7200_000), ...opts });
}
const ids = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/* ---- the required scenarios ---- */

test("a listing missing from healthy full passes is flagged after the configured number of consecutive passes (default 2), not before", async () => {
  assert.equal(DEFAULT_MISSING_PASSES, 2);
  const store = new MemoryStore();
  const all = ids(50);
  await pass(store, day(0), all); // first tracked pass: everything seen
  const r1 = await pass(store, day(1), all.filter((x) => x !== "p7"));
  assert.equal(r1.evaluated, true);
  assert.equal(store.state.get("p7")?.n, 1);
  assert.equal(store.state.get("p7")?.flagged, false, "one missed pass is not enough");
  assert.equal(store.audits.length, 0);
  const r2 = await pass(store, day(2), all.filter((x) => x !== "p7"));
  assert.equal(r2.evaluated && r2.flagged, 1);
  assert.equal(store.state.get("p7")?.flagged, true);
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].field, "disappearance_flag");
  assert.match(store.audits[0].note, /flag only|nothing was hidden/i);
  assert.match(store.audits[0].note, /BAANKNET/);
  assert.equal(store.state.get("p3"), undefined, "listings that were seen get no state");
});

test("the threshold is configurable", async () => {
  const store = new MemoryStore();
  const all = ids(30);
  await pass(store, day(0), all);
  await pass(store, day(1), all.slice(1), healthy(day(1)), { threshold: 1 });
  assert.equal(store.state.get("p0")?.flagged, true);
  const store3 = new MemoryStore();
  await pass(store3, day(0), all);
  await pass(store3, day(1), all.slice(1), healthy(day(1)), { threshold: 3 });
  await pass(store3, day(2), all.slice(1), healthy(day(2)), { threshold: 3 });
  assert.equal(store3.state.get("p0")?.flagged, false);
  await pass(store3, day(3), all.slice(1), healthy(day(3)), { threshold: 3 });
  assert.equal(store3.state.get("p0")?.flagged, true);
});

test("a listing missing from an ANOMALOUS pass is never counted or flagged", async () => {
  for (const status of ["WARNING", "INCOMPLETE", "CRITICAL", "BLOCKED", "FAILED", "NO_DATA", "RECOVERING"] as const) {
    const store = new MemoryStore();
    const all = ids(40);
    await pass(store, day(0), all);
    const bad = { ...healthy(day(1)), dataStatus: status, protection: { protected: true, status, reason: "x", evaluatedAt: null, basis: "verdict" as const } };
    for (let i = 1; i <= 5; i++) {
      const r = await pass(store, day(i), all.slice(10), { ...bad, metrics: { ...bad.metrics, passStartedAt: day(i).toISOString() } });
      assert.equal(r.evaluated, false, status);
    }
    assert.equal(store.state.size, 0, `${status}: no state written`);
    assert.equal(store.audits.length, 0, `${status}: nothing flagged`);
  }
});

test("a PARTIAL or incremental run never triggers disappearance (not eligible, pagination not complete, or no pass start)", async () => {
  const base = healthy(day(1));
  const cases: [string, SourceRunMetrics][] = [
    ["incremental", { ...base.metrics, evaluationEligible: false }],
    ["pagination not complete", { ...base.metrics, paginationComplete: false }],
    ["pagination unknown", { ...base.metrics, paginationComplete: undefined }],
    ["no pass start (the source does not declare a full pass)", { ...base.metrics, passStartedAt: undefined }],
    ["unreadable pass start", { ...base.metrics, passStartedAt: "not a date" }],
    ["blocked", { ...base.metrics, blocked: true }],
    ["structure changed", { ...base.metrics, structureChanged: true }],
  ];
  for (const [name, metrics] of cases) {
    const store = new MemoryStore();
    await pass(store, day(0), ids(40));
    const r = await pass(store, day(1), ids(40).slice(20), { ...base, metrics });
    assert.equal(r.evaluated, false, name);
    assert.equal(store.state.size, 0, name);
  }
});

test("a listing that REAPPEARS clears its flag immediately when it is seen again, and at the next healthy pass otherwise", async () => {
  const store = new MemoryStore();
  const all = ids(50);
  await pass(store, day(0), all);
  await pass(store, day(1), all.filter((x) => x !== "p9"));
  await pass(store, day(2), all.filter((x) => x !== "p9"));
  assert.equal(store.state.get("p9")?.flagged, true);
  // seen again during an ordinary (even partial) run: the flag is cleared at once
  await markSeen(store, SRC, ["p9"], day(2.5));
  assert.equal(store.state.get("p9")?.flagged, false);
  assert.equal(store.state.get("p9")?.n, 0);
  assert.deepEqual(store.audits.map((a) => a.field), ["disappearance_flag", "disappearance_cleared"]);
  // and a later healthy pass that includes it keeps it clear
  await pass(store, day(3), all);
  assert.equal(store.state.get("p9")?.flagged, false);
});

test("the flag is also cleared by the next healthy full pass that sees the listing", async () => {
  const store = new MemoryStore();
  const all = ids(50);
  await pass(store, day(0), all);
  await pass(store, day(1), all.slice(1));
  await pass(store, day(2), all.slice(1));
  assert.equal(store.state.get("p0")?.flagged, true);
  // sighting recorded WITHOUT the immediate clear (e.g. the clear step failed): the sweep still clears it
  store.seen.set("p0", new Date(day(3).getTime() + 1000));
  await runDisappearanceSweep(store, SRC, healthy(day(3)), { now: new Date(day(3).getTime() + 7200_000) });
  assert.equal(store.state.get("p0")?.flagged, false);
  assert.equal(store.audits.at(-1)?.field, "disappearance_cleared");
});

test("a PROTECTED source cannot cause disappearance actions, whatever the latest metrics say", async () => {
  const store = new MemoryStore();
  await pass(store, day(0), ids(40));
  const protectedGate = { ...healthy(day(1)), protection: { protected: true, status: "CRITICAL" as DataHealthStatus, reason: "collapse", evaluatedAt: null, basis: "verdict" as const } };
  assert.equal((await pass(store, day(1), ids(40).slice(10), protectedGate)).evaluated, false);
  const unreadable = { ...healthy(day(2)), protection: unreadableProtection(new Error("db down")) };
  assert.equal((await pass(store, day(2), ids(40).slice(10), unreadable)).evaluated, false, "fails closed when the history cannot be read");
  assert.equal(store.state.size, 0);
  // a source with no verdict at all is not 'trusted' either
  const none = { ...healthy(day(3)), protection: protectionFromRuns([]) };
  assert.equal((await pass(store, day(3), ids(40).slice(10), none)).evaluated, false);
});

/* ---- more safety ---- */

test("the missing count is CONSECUTIVE: a listing seen again in between starts from zero", async () => {
  const store = new MemoryStore();
  const all = ids(50);
  await pass(store, day(0), all);
  await pass(store, day(1), all.slice(1)); // p0 missing once
  assert.equal(store.state.get("p0")?.n, 1);
  await pass(store, day(2), all); // seen again
  assert.equal(store.state.get("p0")?.n, 0);
  await pass(store, day(3), all.slice(1));
  assert.equal(store.state.get("p0")?.flagged, false, "only one miss since it reappeared");
});

test("running the sweep twice for the same pass counts it once", async () => {
  const store = new MemoryStore();
  const all = ids(50);
  await pass(store, day(0), all);
  await pass(store, day(1), all.slice(1));
  await runDisappearanceSweep(store, SRC, healthy(day(1)), { now: new Date(day(1).getTime() + 9000_000) });
  await runDisappearanceSweep(store, SRC, healthy(day(1)), { now: new Date(day(1).getTime() + 9500_000) });
  assert.equal(store.state.get("p0")?.n, 1);
});

test("a listing seen BEFORE the pass started but not during it is missing from that pass", async () => {
  const store = new MemoryStore();
  store.seen.set("old", new Date(day(0).getTime() + 1000));
  store.seen.set("now", new Date(day(1).getTime() + 1000));
  await runDisappearanceSweep(store, SRC, healthy(day(1)), { now: day(1.5) });
  assert.equal(store.state.get("old")?.n, 1);
  assert.equal(store.state.get("now"), undefined);
});

test("MASS-DISAPPEARANCE GUARD: if more than 20% of the tracked listings are missing at once, nothing is flagged (probably a bad read, not 100 real removals)", async () => {
  const store = new MemoryStore();
  const all = ids(100);
  await pass(store, day(0), all);
  const r = await pass(store, day(1), all.slice(40)); // 40% gone while the verdict is still HEALTHY
  assert.equal(r.evaluated, true);
  assert.equal(r.evaluated && r.skippedReason !== undefined, true);
  assert.equal(store.state.size, 0);
  assert.equal(store.audits.length, 0);
  // a normal churn (5%) is evaluated
  const ok = await pass(store, day(2), all.slice(5));
  assert.equal(ok.evaluated && ok.skippedReason === undefined, true);
  assert.equal(store.state.size, 5);
});

test("sightings never throw: a failing store only means nothing is tracked", async () => {
  const broken: LastSeenStore = {
    touch: async () => {
      throw new Error("db down");
    },
    flaggedAmong: async () => {
      throw new Error("db down");
    },
    candidates: async () => {
      throw new Error("db down");
    },
    saveState: async () => {
      throw new Error("db down");
    },
    audit: async () => {
      throw new Error("db down");
    },
  };
  await markSeen(broken, SRC, ["a"], day(0));
  const r = await runDisappearanceSweep(broken, SRC, healthy(day(1)), { now: day(1) });
  assert.equal(r.evaluated, false);
});

test("the gate is the single decision: only a complete, eligible, HEALTHY, unprotected pass with a pass start passes", () => {
  assert.equal(disappearanceGate(healthy(day(1))).ok, true);
  assert.equal(disappearanceGate({ ...healthy(day(1)), dataStatus: "RECOVERING" }).ok, false);
  assert.equal(disappearanceGate({ ...healthy(day(1)), protection: { ...healthy(day(1)).protection, status: "RECOVERING" } }).ok, false, "the protection must itself rest on a HEALTHY verdict");
});

/* ---- wiring / safety guards ---- */

test("tracking is FLAG-ONLY: it never changes a property or an auction, never removes, never deletes", () => {
  for (const file of ["src/lib/pipeline/lastSeen.ts", "src/lib/pipeline/lastSeenStore.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /prisma\.(property|auction)\./, file);
    assert.doesNotMatch(src, /removeListingFromSource|status:\s*"REMOVED"|status:\s*"DUPLICATE"/, file);
    assert.doesNotMatch(src, /\.(delete|deleteMany)\(/, file);
  }
});

test("the gate for a disappearance sweep uses the stricter allowsDisappearanceAction", () => {
  assert.match(read("src/lib/pipeline/lastSeen.ts"), /allowsDisappearanceAction\(/);
});

test("the run log runs the sweep only after it has recorded a verdict, and re-reads the source's protection first", () => {
  const src = read("src/lib/pipeline/runLog.ts");
  assert.match(src, /runDisappearanceSweep\(/);
  const after = src.slice(src.indexOf("sourceRunLog.create"));
  assert.ok(after.indexOf("getSourceProtection(") > 0 && after.indexOf("runDisappearanceSweep(") > after.indexOf("getSourceProtection("), "protection is read from the stored history before the sweep");
});

test("the importer records a sighting for every listing it reads, including re-reads and re-auctions", () => {
  const src = read("src/lib/import/csvImport.ts");
  assert.match(src, /markSeen\(/);
  assert.match(src, /seenIds\.add\(/);
  const hitBlock = src.slice(src.indexOf("if (hit) {"), src.indexOf("await addReauctionRound") > 0 ? src.indexOf("await addReauctionRound") : undefined);
  assert.match(hitBlock, /seenIds\.add\(/, "recorded before a re-auction round can end the loop iteration");
});

test("BAANKNET declares when its pass started, so only a complete pass is judged", () => {
  assert.match(read("src/data-sources/feeds/baanknetImport.ts"), /passStartedAt: st\.startedAt/);
});

test("generic feeds and BankAuctions.in do not declare a pass start, so they never produce disappearance flags", () => {
  assert.doesNotMatch(read("src/data-sources/feeds/run.ts"), /passStartedAt/);
  assert.doesNotMatch(read("src/data-sources/bankauctions/adapter.ts"), /passStartedAt/);
});
