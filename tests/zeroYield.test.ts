import test from "node:test";
import assert from "node:assert/strict";
import {
  ZERO_YIELD_MIN_SPAN_MS,
  describeYield,
  formatYieldMarker,
  isYieldProblem,
  keepYieldState,
  nextChannelYield,
  overallYield,
  parseYieldMarker,
  stripYieldMarker,
  withYieldState,
  yieldStateOf,
  type ChannelYield,
  type YieldRun,
} from "../src/lib/pipeline/zeroYield";

const H = 3_600_000;
const t0 = new Date("2026-10-08T10:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * H);
const empty: YieldRun = { discovered: 0, created: 0, duplicates: 0, rejected: 0 };
const found = (n: number, created = 0): YieldRun => ({ discovered: n, created, duplicates: n - created, rejected: 0 });

test("a run that found listings is PRODUCTIVE", () => {
  const s = nextChannelYield(undefined, found(12, 3), t0);
  assert.equal(s.verdict, "PRODUCTIVE");
  assert.equal(s.zeroStreak, 0);
  assert.equal(s.lastDiscovered, 12);
});

test("finding listings that are all already known is still PRODUCTIVE (nothing new is not a failure)", () => {
  assert.equal(nextChannelYield(undefined, found(20, 0), t0).verdict, "PRODUCTIVE");
});

test("the first empty run is only EMPTY; it takes several runs over several hours to call ZERO_YIELD", () => {
  let s = nextChannelYield(undefined, empty, at(0));
  assert.equal(s.verdict, "EMPTY");
  s = nextChannelYield(s, empty, at(1));
  s = nextChannelYield(s, empty, at(2));
  assert.equal(s.zeroStreak, 3);
  assert.equal(s.verdict, "EMPTY", "3 runs but only 2 hours apart: a burst of manual runs must not trigger the alarm");
  s = nextChannelYield(s, empty, at(ZERO_YIELD_MIN_SPAN_MS / H + 0.1));
  assert.equal(s.verdict, "ZERO_YIELD");
});

test("a source that worked and now finds nothing is DROPPED immediately", () => {
  const ok = nextChannelYield(undefined, found(40, 5), at(0));
  const s = nextChannelYield(ok, empty, at(1));
  assert.equal(s.verdict, "DROPPED");
  assert.ok(s.lastProductiveAt);
});

test("DROPPED recovers as soon as listings are found again, and the streak resets", () => {
  let s = nextChannelYield(nextChannelYield(undefined, found(10), at(0)), empty, at(1));
  assert.equal(s.verdict, "DROPPED");
  s = nextChannelYield(s, found(8, 1), at(2));
  assert.equal(s.verdict, "PRODUCTIVE");
  assert.equal(s.zeroStreak, 0);
  assert.equal(s.firstZeroAt, undefined);
});

test("listings found but every one rejected for 3 runs in a row is ALL_REJECTED; one valid record clears it", () => {
  const rej: YieldRun = { discovered: 9, created: 0, duplicates: 0, rejected: 9 };
  let s = nextChannelYield(undefined, rej, at(0));
  s = nextChannelYield(s, rej, at(1));
  assert.equal(s.verdict, "PRODUCTIVE");
  s = nextChannelYield(s, rej, at(2));
  assert.equal(s.verdict, "ALL_REJECTED");
  s = nextChannelYield(s, { discovered: 9, created: 1, duplicates: 0, rejected: 8 }, at(3));
  assert.equal(s.verdict, "PRODUCTIVE");
  assert.equal(s.rejectStreak, 0);
});

test("a source is PRODUCTIVE overall if any channel recently found listings (empty list page + working site scan)", () => {
  const now = at(5);
  const state = { list: nextChannelYield(undefined, empty, at(4)), site: nextChannelYield(undefined, found(474, 9), at(4)) };
  assert.equal(overallYield(state, now), "PRODUCTIVE");
});

test("overall verdict is the worst channel when none is productive, and null when never measured", () => {
  const dropped = nextChannelYield(nextChannelYield(undefined, found(5), at(0)), empty, at(1));
  const emptyOnly = nextChannelYield(undefined, empty, at(1));
  assert.equal(overallYield({ site: emptyOnly, list: dropped }, at(2)), "DROPPED");
  assert.equal(overallYield({}, at(2)), null);
  assert.equal(overallYield(null, at(2)), null);
});

test("a productive channel that has not run for weeks no longer vouches for the source", () => {
  const old: ChannelYield = nextChannelYield(undefined, found(10), at(0));
  const stale = { site: old, list: nextChannelYield(undefined, empty, at(24 * 30)) };
  assert.notEqual(overallYield(stale, at(24 * 30 + 1)), "PRODUCTIVE");
});

test("state survives a round trip inside sheetState and leaves every other key alone", () => {
  const raw = JSON.stringify({ web: { seen: ["a"], importAll: true }, baanknet: { si: 1, page: 7 }, tabs: { csv: { hash: "x" } } });
  const st = { site: nextChannelYield(undefined, empty, at(0)) };
  const out = withYieldState(raw, st);
  const j = JSON.parse(out);
  assert.deepEqual(j.web, { seen: ["a"], importAll: true });
  assert.deepEqual(j.baanknet, { si: 1, page: 7 });
  assert.deepEqual(j.tabs, { csv: { hash: "x" } });
  assert.equal(yieldStateOf(out).site?.verdict, "EMPTY");
});

test("yieldStateOf tolerates empty, broken and hostile state", () => {
  assert.deepEqual(yieldStateOf(null), {});
  assert.deepEqual(yieldStateOf("not json"), {});
  assert.deepEqual(yieldStateOf(JSON.stringify({ yield: { site: { verdict: "NOPE" }, list: 5 } })), {});
});

test("keepYieldState carries the streak into a rebuilt state string", () => {
  const old = withYieldState(JSON.stringify({ tabs: {} }), { sheet: nextChannelYield(undefined, empty, at(0)) });
  const rebuilt = keepYieldState(old, JSON.stringify({ tabs: { csv: { hash: "new" } } }));
  assert.equal(yieldStateOf(rebuilt).sheet?.zeroStreak, 1);
  assert.deepEqual(JSON.parse(rebuilt).tabs, { csv: { hash: "new" } });
  assert.equal(keepYieldState(null, "{\"tabs\":{}}"), "{\"tabs\":{}}");
});

test("the run-log marker round-trips, is found after a metrics header, and is stripped for display", () => {
  const m = { channel: "site" as const, verdict: "ZERO_YIELD" as const, discovered: 0, streak: 4 };
  const line = formatYieldMarker(m);
  assert.deepEqual(parseYieldMarker(line + "\nSite scan: 0 listing page(s) found"), m);
  const withHeader = `[DATA_ENGINE_V1] {"metrics":{}}\n${line}\nhuman text`;
  assert.deepEqual(parseYieldMarker(withHeader), m);
  assert.equal(stripYieldMarker(`${line}\nSite scan: 0 found`), "Site scan: 0 found");
  assert.equal(parseYieldMarker("plain message"), null);
  assert.equal(parseYieldMarker("[YIELD_V1] {broken"), null);
});

test("problem verdicts are exactly the three that need a human", () => {
  assert.deepEqual(["PRODUCTIVE", "EMPTY", "ZERO_YIELD", "DROPPED", "ALL_REJECTED"].filter((v) => isYieldProblem(v as never)), ["ZERO_YIELD", "DROPPED", "ALL_REJECTED"]);
  for (const v of ["PRODUCTIVE", "EMPTY", "ZERO_YIELD", "DROPPED", "ALL_REJECTED"] as const) assert.ok(describeYield(v).length > 10);
});
