import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  IMPORT_WEIGHT,
  MAX_IMPORT_SLICE_MS,
  MAX_PLAIN_SLICE_MS,
  MIN_IMPORT_SLICE_MS,
  MIN_SLICE_MS,
  SCAN_MARGIN_MS,
  SCAN_WINDOW_MS,
  STARVED_AFTER_MS,
  orderByWaiting,
  planScanOrder,
  scanWindowEnd,
  sliceFor,
  type PlanSource,
} from "../src/lib/pipeline/tickPlan";
import { CLAIM_STALE_MS, MIN_TICK_GAP_MS, leaseBlockedBy, leaseWinner } from "../src/lib/pipeline/tickLease";
import { LATE_AFTER_MIN, schedulerHealth } from "../src/lib/pipeline/schedulerHealth";

/*
 * Scheduler scalability (Phase 3, PR 5). The tick keeps its architecture and its 262 s hard deadline. What changes:
 * a fair, bounded time slice per source; a lease so that several triggers (GitHub, an external pinger, visitors) can never run
 * two ticks at once; and a late-tick alarm at about 60 minutes.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const MIN = 60_000;
const HOUR = 60 * MIN;

/* ---- the tick's time boundaries ---- */

test("DEADLINE: the scan window never extends past hardEnd minus the margin, and never past its own 150 s cap", () => {
  const now = 1_000_000_000_000;
  const hardEnd = now + 200_000;
  assert.equal(scanWindowEnd(now, hardEnd), hardEnd - SCAN_MARGIN_MS);
  assert.equal(scanWindowEnd(now, now + 262_000), now + SCAN_WINDOW_MS, "with the real 262 s deadline the 150 s cap is the tighter limit");
  assert.ok(scanWindowEnd(now, hardEnd) <= hardEnd - 70_000);
  assert.equal(scanWindowEnd(now, undefined), now + SCAN_WINDOW_MS);
  assert.equal(scanWindowEnd(now, now + 1_000_000), now + SCAN_WINDOW_MS, "a distant deadline cannot extend the window past 150 s");
  assert.ok(scanWindowEnd(now, now + 30_000) < now, "a tick that is almost over has no scan window left");
});

test("DEADLINE: the 262 s hard deadline is preserved in the tick and passed down to the feeds", () => {
  const tick = read("src/lib/pipeline/tick.ts");
  assert.match(tick, /startedAt\.getTime\(\) \+ 262_000/);
  assert.match(tick, /runAllFeeds\(\{[^}]*hardEnd/);
  assert.match(read("src/data-sources/feeds/run.ts"), /scanWindowEnd\(/);
});

/* ---- per-source time budget ---- */

const src = (id: string, o: Partial<PlanSource> = {}): PlanSource => ({ id, importing: false, baanknet: false, lastScanAt: 0, ...o });

/** Runs one scan window the way runAllFeeds does: every source in plan order gets its slice; time is spent; returns who ran. */
function runWindow(sources: PlanSource[], now: number, window = SCAN_WINDOW_MS, spend: (s: PlanSource, budget: number) => number = (_s, b) => b) {
  const queue = planScanOrder(sources, now);
  let left = window;
  const ran: { id: string; budget: number }[] = [];
  const deferred: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const budget = sliceFor(queue[i], queue.slice(i), left);
    if (budget === null) {
      deferred.push(queue[i].id);
      continue;
    }
    ran.push({ id: queue[i].id, budget });
    left -= spend(queue[i], budget);
  }
  return { ran, deferred, left };
}

test("TIME BUDGET: no source gets more than its cap, and the slices together never exceed the window", () => {
  for (const n of [1, 2, 5, 12, 40, 200]) {
    const sources = Array.from({ length: n }, (_, i) => src(`s${i}`, { lastScanAt: i }));
    const { ran, left } = runWindow(sources, 10_000_000);
    for (const r of ran) assert.ok(r.budget <= MAX_PLAIN_SLICE_MS && r.budget >= MIN_SLICE_MS, `${n} sources: ${r.budget}`);
    assert.ok(left >= 0, `${n} sources: window overspent`);
  }
  const importing = runWindow([src("b", { importing: true, baanknet: true })], 10_000_000);
  assert.ok(importing.ran[0].budget <= MAX_IMPORT_SLICE_MS && importing.ran[0].budget >= MIN_IMPORT_SLICE_MS);
});

test("TIME BUDGET: a lone source keeps today's behaviour (60 s for a plain source, the whole window for an importing one)", () => {
  assert.equal(runWindow([src("a")], 1e9).ran[0].budget, MAX_PLAIN_SLICE_MS);
  assert.equal(runWindow([src("b", { importing: true, baanknet: true })], 1e9).ran[0].budget, SCAN_WINDOW_MS);
});

test("TIME BUDGET: an importing source never gets less than the 70 s it needs to start a batch; if the window is shorter it is deferred, not given a useless slice", () => {
  const queue = [src("b", { importing: true, baanknet: true })];
  assert.equal(sliceFor(queue[0], queue, MIN_IMPORT_SLICE_MS - 1), null);
  assert.ok((sliceFor(queue[0], queue, MIN_IMPORT_SLICE_MS) ?? 0) >= MIN_IMPORT_SLICE_MS);
  assert.equal(sliceFor(src("a"), [src("a")], MIN_SLICE_MS - 1), null);
});

/* ---- fairness ---- */

test("FAIRNESS: a BAANKNET Import-all cannot take the whole window while other sources are waiting", () => {
  const sources = [src("baanknet", { importing: true, baanknet: true, lastScanAt: 5 }), ...Array.from({ length: 3 }, (_, i) => src(`plain${i}`, { lastScanAt: 10 + i }))];
  const { ran, deferred } = runWindow(sources, 1e9);
  assert.equal(ran.length, 4, "everyone gets a turn in this window");
  assert.equal(deferred.length, 0);
  const b = ran.find((r) => r.id === "baanknet")!;
  assert.ok(b.budget < SCAN_WINDOW_MS * 0.6, `importing source took ${b.budget} ms of ${SCAN_WINDOW_MS}`);
  assert.ok(b.budget >= MIN_IMPORT_SLICE_MS);
  assert.ok(IMPORT_WEIGHT > 1, "importing sources are still favoured, just not exclusive");
});

test("FAIRNESS: with more sources than one tick can serve, the ones skipped go first next time, so every source is served within a bounded number of ticks", () => {
  const n = 30;
  const sources = Array.from({ length: n }, (_, i) => src(`s${i}`, { lastScanAt: 0 }));
  const servedAt = new Map<string, number>();
  const now0 = 1_000_000_000_000;
  for (let tick = 0; tick < 20; tick++) {
    const now = now0 + tick * 5 * MIN;
    const { ran } = runWindow(sources, now);
    for (const r of ran) {
      servedAt.set(r.id, tick);
      sources.find((s) => s.id === r.id)!.lastScanAt = now;
    }
    if (servedAt.size === n) {
      assert.ok(tick <= 10, `all ${n} sources served after ${tick + 1} ticks`);
      return;
    }
  }
  assert.fail(`not every source was served: ${servedAt.size}/${n}`);
});

test("FAIRNESS: the one that waited longest is served first; a source starved for hours goes ahead of an importing one", () => {
  const now = 1_000_000_000_000;
  const order = planScanOrder([src("recent", { lastScanAt: now - 5 * MIN }), src("old", { lastScanAt: now - 30 * MIN }), src("imp", { importing: true, lastScanAt: now - HOUR })], now);
  assert.deepEqual(order.map((s) => s.id), ["imp", "old", "recent"], "importing first, then oldest first");
  const starved = planScanOrder([src("imp", { importing: true, baanknet: true, lastScanAt: now - 5 * MIN }), src("starved", { lastScanAt: now - STARVED_AFTER_MS - MIN })], now);
  assert.deepEqual(starved.map((s) => s.id), ["starved", "imp"]);
});

test("FAIRNESS: sources that never ran (lastScanAt 0) go before everything that did", () => {
  const now = 1_000_000_000_000;
  const order = planScanOrder([src("a", { lastScanAt: now - 40 * MIN }), src("new", { lastScanAt: 0 })], now);
  assert.equal(order[0].id, "new");
});

test("FAIRNESS: the per-source loop (sheets, CSV, AI pages) is ordered oldest-run first, so the same sources are not always the ones deferred", () => {
  const rows = [
    { id: "a", lastRunAt: new Date(3000) },
    { id: "b", lastRunAt: null },
    { id: "c", lastRunAt: new Date(1000) },
  ];
  assert.deepEqual(orderByWaiting(rows).map((r) => r.id), ["b", "c", "a"]);
  assert.match(read("src/data-sources/feeds/run.ts"), /orderByWaiting\(feeds\)/);
});

/* ---- claim lock / duplicate triggers ---- */

test("CLAIM RACE: two triggers that claim at the same moment: exactly one wins, the same one for both, whatever order they look", () => {
  const t = new Date("2026-10-08T10:00:00.000Z");
  const markers = [
    { id: "zzz", startedAt: t },
    { id: "aaa", startedAt: t },
    { id: "mmm", startedAt: new Date(t.getTime() + 5) },
  ];
  assert.equal(leaseWinner(markers), "aaa");
  assert.equal(leaseWinner([...markers].reverse()), "aaa");
  assert.equal(leaseWinner([]), null);
  const winners = markers.filter((m) => leaseWinner(markers) === m.id);
  assert.equal(winners.length, 1);
});

test("DUPLICATE TRIGGERS: while a tick is running, a second trigger (pinger, visitor, retry) is refused; so is one right after a tick", () => {
  const now = new Date("2026-10-08T10:02:00.000Z");
  const running = [{ kind: "claim", startedAt: new Date(now.getTime() - 2 * MIN) }];
  assert.match(leaseBlockedBy(running, now) ?? "", /running/);
  const justRan = [{ kind: "cron", startedAt: new Date(now.getTime() - 1 * MIN) }];
  assert.match(leaseBlockedBy(justRan, now) ?? "", /just ran|recent/);
  assert.equal(leaseBlockedBy([], now), null);
});

test("DUPLICATE TRIGGERS: the normal 5-minute GitHub rhythm is never blocked, and a claim from a cut-off run expires", () => {
  const now = new Date("2026-10-08T10:05:00.000Z");
  assert.equal(leaseBlockedBy([{ kind: "cron", startedAt: new Date(now.getTime() - 5 * MIN) }], now), null, "the last tick started 5 minutes ago");
  assert.ok(MIN_TICK_GAP_MS < 5 * MIN, "the minimum gap must be shorter than the trigger interval");
  assert.equal(leaseBlockedBy([{ kind: "claim", startedAt: new Date(now.getTime() - CLAIM_STALE_MS - 1000) }], now), null, "a claim older than 6 minutes belongs to a dead run");
  assert.equal(leaseBlockedBy([{ kind: "claim_done", startedAt: new Date(now.getTime() - 10_000) }], now), null, "a released claim blocks nothing");
});

test("DUPLICATE TRIGGERS: three triggers in one minute (GitHub, external pinger, visitor) start exactly one tick; the next window starts another", () => {
  type Row = { id: string; kind: string; startedAt: Date };
  const db: Row[] = [];
  let seq = 0;
  let ticksRun = 0;
  const trigger = (at: Date, finishSameMoment = false) => {
    const blocked = leaseBlockedBy(db.filter((r) => r.startedAt.getTime() > at.getTime() - CLAIM_STALE_MS), at);
    if (blocked) return false;
    const mine: Row = { id: `c${++seq}`, kind: "claim", startedAt: at };
    db.push(mine);
    const winner = leaseWinner(db.filter((r) => r.kind === "claim" && r.startedAt.getTime() >= at.getTime() - 60_000));
    if (winner !== mine.id) {
      mine.kind = "claim_done";
      return false;
    }
    ticksRun++;
    if (finishSameMoment) {
      mine.kind = "claim_done";
      db.push({ id: `t${seq}`, kind: "cron", startedAt: at });
    }
    return true;
  };
  const t0 = new Date("2026-10-08T10:00:00.000Z");
  assert.equal(trigger(t0), true);
  assert.equal(trigger(new Date(t0.getTime() + 20_000)), false);
  assert.equal(trigger(new Date(t0.getTime() + 60_000)), false);
  assert.equal(ticksRun, 1);
  // the first tick finishes; its claim is released and a cron row exists
  db[0].kind = "claim_done";
  db.push({ id: "tick0", kind: "cron", startedAt: t0 });
  assert.equal(trigger(new Date(t0.getTime() + 2 * MIN)), false, "an extra trigger 2 minutes later is still inside the minimum gap");
  assert.equal(trigger(new Date(t0.getTime() + 5 * MIN)), true, "the next 5-minute window runs");
  assert.equal(ticksRun, 2);
});

test("the cron endpoint takes the lease before it runs the tick, answers 200 'skipped' when another tick holds it, and always releases it", () => {
  const route = read("src/app/api/cron/ingest/route.ts");
  assert.match(route, /acquireTickLease\(/);
  assert.match(route, /skipped: true/);
  assert.ok(route.indexOf("acquireTickLease(") < route.indexOf("runTick("));
  const tick = read("src/lib/pipeline/tick.ts");
  assert.match(tick, /releaseTickLease\(/);
  assert.match(tick, /finally/);
  assert.match(read("src/app/api/me/route.ts"), /claimId/);
});

test("the existing GitHub Actions trigger is kept unchanged", () => {
  const yml = read(".github/workflows/tick.yml");
  assert.match(yml, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(yml, /api\/cron\/ingest\?limit=100/);
});

/* ---- late tick detection / alerting ---- */

const ok = (minutesAgo: number, now: Date) => ({ startedAt: new Date(now.getTime() - minutesAgo * MIN), status: "ok" });

test("LATE TICK: no successful tick for about 60 minutes is late; 59 is not", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  assert.equal(LATE_AFTER_MIN, 60);
  assert.equal(schedulerHealth(ok(59, now), now).late, false);
  assert.equal(schedulerHealth(ok(61, now), now).late, true);
  assert.equal(schedulerHealth(ok(5, now), now).state, "ok");
  assert.equal(schedulerHealth(ok(61, now), now).state, "late");
});

test("LATE TICK: a source that never ran a tick is reported as 'never', which also alerts; an error tick is not a successful tick", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  const never = schedulerHealth(null, now);
  assert.equal(never.state, "never");
  assert.equal(never.late, true);
  assert.equal(schedulerHealth({ startedAt: new Date(now.getTime() - 1 * MIN), status: "error" }, now).late, true, "only an ok tick counts");
});

test("ALERTING: a health endpoint answers 503 when late (any uptime monitor can alert on it) and a scheduled watchdog fails the GitHub job", () => {
  const route = read("src/app/api/cron/health/route.ts");
  assert.match(route, /status: 503/);
  assert.match(route, /schedulerHealth\(/);
  assert.match(route, /CRON_SECRET/);
  assert.ok(existsSync(join(__dirname, "..", ".github/workflows/scheduler-watchdog.yml")));
  const wd = read(".github/workflows/scheduler-watchdog.yml");
  assert.match(wd, /schedule:/);
  assert.match(wd, /api\/cron\/health/);
  assert.match(wd, /exit 1/);
});

test("the Engine page uses the same successful-tick rule and the 60-minute limit", () => {
  const page = read("src/app/admin/(shell)/engine/page.tsx");
  assert.match(page, /schedulerHealth\(/);
  assert.doesNotMatch(page, /tickAgeMin > 90/);
});

test("scheduler changes do not touch listings", () => {
  for (const f of ["src/lib/pipeline/tickPlan.ts", "src/lib/pipeline/tickLease.ts", "src/lib/pipeline/schedulerHealth.ts"]) {
    const s = read(f);
    assert.doesNotMatch(s, /prisma\./, f);
    assert.doesNotMatch(s, /status:\s*"REMOVED"/, f);
  }
});
