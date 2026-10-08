import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DataHealthStatus, HistoricalRun, SourceRunMetrics } from "../src/lib/pipeline/completeness";
import { protectionFromRuns, type SourceProtection } from "../src/lib/pipeline/sourceProtection";
import {
  MAX_RECOVERY_ATTEMPTS,
  QUEUE_EXPIRY_MS,
  RECOVERY_COOLDOWN_MS,
  RECOVERY_KIND,
  advanceRecovery,
  mechanismFor,
  planRecovery,
  type RecoveryEvent,
  type RecoveryStore,
  type RecoveryState,
} from "../src/lib/pipeline/recovery";

/*
 * Automatic recovery (Phase 3, PR 7).
 *   HEALTHY -> COLLAPSED -> PROTECTED -> RECOVERY QUEUED -> FULL HEALTHY PASS -> HEALTHY
 * Recovery never clears protection itself: protection is derived from the latest evaluated run, so only a healthy complete pass can end it.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const SRC = "BankAuctions.in";
const H = 3_600_000;
const t0 = new Date("2026-10-08T06:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const run = (hours: number, dataStatus: DataHealthStatus, m: Partial<SourceRunMetrics> = {}, protect?: boolean): HistoricalRun => ({
  startedAt: at(hours),
  technicalStatus: "ok",
  dataStatus,
  protectExistingData: protect ?? !["HEALTHY", "RECOVERING"].includes(dataStatus),
  metrics: { recordsFound: 1000, evaluationEligible: true, paginationComplete: true, ...m } as SourceRunMetrics,
});
/** newest first, as the history loader returns it */
const hist = (...runs: HistoricalRun[]) => runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
const incremental = (hours: number, dataStatus: DataHealthStatus = "RECOVERING", protect = false) =>
  run(hours, dataStatus, { evaluationEligible: false, paginationComplete: false }, protect);

const ev = (state: RecoveryState, hours: number): RecoveryEvent => ({ state, at: at(hours), mechanism: "import_all", reason: "" });

class MemoryStore implements RecoveryStore {
  rows: (RecoveryEvent & { id: string; seq: number })[] = [];
  started: string[] = [];
  seq = 0;
  async events(_source?: string) {
    return [...this.rows].sort((a, b) => b.at.getTime() - a.at.getTime() || b.seq - a.seq);
  }
  async add(_s: string, e: RecoveryEvent) {
    const id = `r${++this.seq}`;
    this.rows.push({ ...e, id, seq: this.seq });
    return id;
  }
  async remove(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async startFullPass(_s: string, mechanism: string) {
    this.started.push(mechanism);
  }
  states() {
    return this.rows.map((r) => r.state);
  }
}

const collapsed = (extra: HistoricalRun[] = []) => hist(run(0, "HEALTHY"), run(5, "CRITICAL"), ...extra);
const prot = (h: HistoricalRun[]): SourceProtection => protectionFromRuns(h);

test("a collapse (protected CRITICAL/INCOMPLETE) queues exactly one recovery", () => {
  for (const s of ["CRITICAL", "INCOMPLETE"] as DataHealthStatus[]) {
    const h = hist(run(0, "HEALTHY"), run(5, s));
    const plan = planRecovery({ protection: prot(h), history: h, events: [], now: at(6), mechanism: "import_all" });
    assert.equal(plan.action, "queue", s);
  }
});

test("only a collapse is recovered automatically: blocked, failed, warning, no-data and unprotected sources need a person or nothing", () => {
  for (const s of ["BLOCKED", "FAILED", "WARNING", "NO_DATA"] as DataHealthStatus[]) {
    const h = hist(run(0, "HEALTHY"), run(5, s));
    assert.equal(planRecovery({ protection: prot(h), history: h, events: [], now: at(6), mechanism: "import_all" }).action, "none", s);
  }
  const ok = hist(run(0, "HEALTHY"));
  assert.equal(planRecovery({ protection: prot(ok), history: ok, events: [], now: at(6), mechanism: "import_all" }).action, "none", "healthy source");
});

test("an unreadable history (fails closed) never queues anything", () => {
  const p: SourceProtection = { protected: true, status: null, reason: "unreadable", evaluatedAt: null, basis: "unreadable" };
  assert.equal(planRecovery({ protection: p, history: [], events: [], now: at(6), mechanism: "import_all" }).action, "none");
});

test("a second request while one is queued is refused (no repeated launches)", () => {
  const h = collapsed();
  const plan = planRecovery({ protection: prot(h), history: h, events: [ev("QUEUED", 5.5)], now: at(7), mechanism: "import_all" });
  assert.equal(plan.action, "none");
  assert.match(plan.reason, /already queued/i);
});

test("two simultaneous requests end with ONE queued row and ONE launch", async () => {
  const store = new MemoryStore();
  const h = collapsed();
  const input = { source: SRC, protection: prot(h), history: h, now: at(6) };
  const [a, b] = await Promise.all([advanceRecovery(store, input), advanceRecovery(store, input)]);
  assert.deepEqual(store.states(), ["QUEUED"]);
  assert.equal(store.started.length, 1);
  assert.equal([a, b].filter((o) => o.action === "queue").length, 1);
});

test("advancing again while queued does nothing", async () => {
  const store = new MemoryStore();
  const h = collapsed();
  for (let i = 0; i < 5; i++) await advanceRecovery(store, { source: SRC, protection: prot(h), history: h, now: at(6 + i * 0.1) });
  assert.equal(store.rows.length, 1);
  assert.equal(store.started.length, 1);
});

test("a partial / incremental pass does not complete or clear the recovery", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), incremental(6.5), incremental(7), incremental(7.2, "RECOVERING", true));
  const p = prot(h);
  assert.equal(p.protected, true, "protection from the collapse is still on");
  const plan = planRecovery({ protection: p, history: h, events: [ev("QUEUED", 6)], now: at(8), mechanism: "import_all" });
  assert.equal(plan.action, "none");
});

test("an incremental run that merely LOOKS healthy does not complete a recovery", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), incremental(7, "HEALTHY", false));
  const plan = planRecovery({ protection: prot(h), history: h, events: [ev("QUEUED", 6)], now: at(8), mechanism: "import_all" });
  assert.notEqual(plan.action, "complete");
});

test("a complete HEALTHY pass after the request completes it, and protection is gone because of the run, not because recovery said so", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), run(9, "HEALTHY"));
  const p = prot(h);
  assert.equal(p.protected, false);
  const plan = planRecovery({ protection: p, history: h, events: [ev("QUEUED", 6)], now: at(10), mechanism: "import_all" });
  assert.equal(plan.action, "complete");
});

test("a HEALTHY pass from BEFORE the request does not complete it", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"));
  const plan = planRecovery({ protection: prot(h), history: h, events: [ev("QUEUED", 6)], now: at(7), mechanism: "import_all" });
  assert.equal(plan.action, "none");
});

test("a complete pass that is still bad counts as a failed attempt and does not clear protection", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), run(9, "CRITICAL"));
  const p = prot(h);
  assert.equal(p.protected, true);
  const plan = planRecovery({ protection: p, history: h, events: [ev("QUEUED", 6)], now: at(10), mechanism: "import_all" });
  assert.equal(plan.action, "fail_attempt");
});

test("a request that never gets a complete pass expires, and a new one is possible only after the cooldown", () => {
  const h = collapsed();
  const stale = [ev("QUEUED", 6)];
  const exp = planRecovery({ protection: prot(h), history: h, events: stale, now: new Date(at(6).getTime() + QUEUE_EXPIRY_MS + 1), mechanism: "import_all" });
  assert.equal(exp.action, "expire");
  const afterExpire = [ev("EXPIRED", 31), ev("QUEUED", 6)];
  assert.equal(planRecovery({ protection: prot(h), history: h, events: afterExpire, now: at(32), mechanism: "import_all" }).action, "queue", "the cooldown since the last request has passed");
});

test("cooldown: no new request within the cooldown of the previous one", () => {
  const h = collapsed();
  const events = [ev("FAILED_ATTEMPT", 8), ev("QUEUED", 6)];
  const early = planRecovery({ protection: prot(h), history: h, events, now: at(6 + RECOVERY_COOLDOWN_MS / H - 1), mechanism: "import_all" });
  assert.equal(early.action, "none");
  assert.match(early.reason, /wait/i);
  const later = planRecovery({ protection: prot(h), history: h, events, now: at(6 + RECOVERY_COOLDOWN_MS / H + 1), mechanism: "import_all" });
  assert.equal(later.action, "queue");
});

test("attempts are capped per collapse; then it stops and says a person must decide", () => {
  const h = collapsed();
  const events: RecoveryEvent[] = [];
  for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i++) events.unshift(ev("QUEUED", 6 + i * 20), ev("FAILED_ATTEMPT", 8 + i * 20));
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const now = at(6 + MAX_RECOVERY_ATTEMPTS * 20 + 30);
  const plan = planRecovery({ protection: prot(h), history: h, events, now, mechanism: "import_all" });
  assert.equal(plan.action, "exhausted");
  assert.match(plan.reason, /accept|person|admin/i);
  const again = planRecovery({ protection: prot(h), history: h, events: [ev("EXHAUSTED", 90), ...events], now: at(100), mechanism: "import_all" });
  assert.equal(again.action, "none", "the exhausted note is written once");
});

test("attempts from an EARLIER, healed collapse do not count against a new one", () => {
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), run(9, "HEALTHY"), run(30, "INCOMPLETE"));
  const old: RecoveryEvent[] = [ev("DONE", 10), ev("QUEUED", 6), ev("FAILED_ATTEMPT", 3), ev("QUEUED", 1), ev("FAILED_ATTEMPT", 2), ev("QUEUED", 0.5)];
  old.sort((a, b) => b.at.getTime() - a.at.getTime());
  assert.equal(planRecovery({ protection: prot(h), history: h, events: old, now: at(31), mechanism: "import_all" }).action, "queue");
});

test("an admin accepting the baseline while a request is queued ends the request without any recovery claim", () => {
  const accepted = run(7, "HEALTHY", { baselineAccepted: true, evaluationEligible: true });
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), accepted);
  const plan = planRecovery({ protection: prot(h), history: h, events: [ev("QUEUED", 6)], now: at(8), mechanism: "import_all" });
  assert.equal(plan.action, "complete");
});

test("advanceRecovery launches the full pass only through the source's own mechanism", async () => {
  const store = new MemoryStore();
  const h = collapsed();
  const out = await advanceRecovery(store, { source: SRC, protection: prot(h), history: h, now: at(6) });
  assert.equal(out.action, "queue");
  assert.deepEqual(store.started, ["import_all"]);
  const other = new MemoryStore();
  const out2 = await advanceRecovery(other, { source: "BAANKNET", protection: prot(h), history: h, now: at(6) });
  assert.equal(out2.action, "queue");
  assert.deepEqual(other.started, ["scheduled"], "recorded; the source's own schedule does the pass, nothing extra is launched");
});

test("completing writes DONE and does not launch anything", async () => {
  const store = new MemoryStore();
  await store.add(SRC, ev("QUEUED", 6));
  const h = hist(run(0, "HEALTHY"), run(5, "CRITICAL"), run(9, "HEALTHY"));
  const out = await advanceRecovery(store, { source: SRC, protection: prot(h), history: h, now: at(10) });
  assert.equal(out.action, "complete");
  assert.equal((await store.events(SRC))[0].state, "DONE");
  assert.equal(store.started.length, 0);
});

test("mechanism: only BankAuctions.in can be given an extra full pass", () => {
  assert.equal(mechanismFor("BankAuctions.in"), "import_all");
  for (const s of ["BAANKNET", "Some Feed", "CSV"]) assert.equal(mechanismFor(s), "scheduled");
});

/* ---- wiring / safety guards ---- */

test("recovery is hooked into logRun after the verdict, can never fail a run, and uses its own kind", () => {
  const s = read("src/lib/pipeline/runLog.ts");
  assert.match(s, /advanceRecovery\(/);
  assert.ok(s.indexOf("advanceRecovery(") > s.indexOf("runDisappearanceSweep("), "after the verdict and sweep");
  assert.equal(RECOVERY_KIND, "recovery");
});

test("the Prisma store only writes its own recovery rows and the existing Import-all switch", () => {
  const s = read("src/lib/pipeline/recoveryStore.ts");
  assert.doesNotMatch(s, /\.(property|auction|propertyChange|feedSource|source|sourceRecord)\.(update|updateMany|delete|deleteMany|create|upsert)/);
  assert.match(s, /setBuiltInImportAll\(true\)/);
  assert.doesNotMatch(s, /acceptNewBaseline|status:\s*"(REMOVED|HIDDEN)"/, "recovery never accepts a baseline or hides anything");
});

test("recovery rows stay visible in Engine -> History (not in the hidden kinds) and exhausted ones show under Problems", () => {
  const s = read("src/app/admin/(shell)/engine/history/page.tsx");
  const hidden = /notIn: \[([^\]]*)\]/.exec(s)![1];
  assert.doesNotMatch(hidden, /"recovery"/);
  assert.match(s, /"exhausted"/);
});

test("recovery never touches the completeness verdict or the protection rules", () => {
  const s = read("src/lib/pipeline/recovery.ts");
  assert.doesNotMatch(s, /protectExistingData\s*=|dataStatus\s*=[^=]/);
  assert.doesNotMatch(s, /from "\.\/runLog"|prisma/);
});
