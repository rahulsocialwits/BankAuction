import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeCoverage, type CoverageAuctionRow } from "../src/lib/pipeline/coverage";
import {
  ALL_SCOPE,
  SNAPSHOT_KIND,
  buildSnapshots,
  istDateKey,
  parseSnapshot,
  snapshotSource,
  trendOf,
  writeSnapshots,
  type SnapshotStore,
  type StoredSnapshot,
} from "../src/lib/pipeline/coverageHistory";

/*
 * Daily coverage history (Phase 3, PR 6). One reading per source per India date, rewritten (never added to) if taken again the same day.
 * Pure logic + an in-memory twin of the store; the Prisma store only moves rows.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const day = 864e5;
const now = new Date("2026-10-08T12:00:00Z"); // 17:30 IST, 8 Oct
const row = (o: Partial<CoverageAuctionRow> = {}): CoverageAuctionRow => ({
  externalId: "src:alpha.in:1",
  sourceUrl: "https://alpha.in/1",
  auctionStatus: "UPCOMING",
  auctionStart: new Date(now.getTime() + 5 * day),
  auctionEnd: null,
  reservePrice: 4_500_000,
  propertyStatus: "PUBLISHED",
  hasAddress: true,
  ...o,
});

const rows = (): CoverageAuctionRow[] => [
  row({ externalId: "src:alpha.in:1" }),
  row({ externalId: "src:alpha.in:2", reservePrice: null }), // current, not actionable
  row({ externalId: "src:alpha.in:3", propertyStatus: "DUPLICATE" }),
  row({ externalId: "src:alpha.in:4", auctionStart: new Date(now.getTime() - 3 * day) }), // stale
  row({ externalId: "src:beta.in:1", sourceUrl: "https://beta.in/1" }),
  row({ externalId: "src:beta.in:2", propertyStatus: "REMOVED" }),
  row({ externalId: null, sourceUrl: null }), // manual / unknown
];

class MemoryStore implements SnapshotStore {
  rowsBySource = new Map<string, StoredSnapshot[]>();
  creates = 0;
  updates = 0;
  seq = 0;
  async findAll(source: string) {
    return this.rowsBySource.get(source) ?? [];
  }
  async create(source: string, message: string, startedAt: Date) {
    this.creates++;
    const list = this.rowsBySource.get(source) ?? [];
    list.push({ id: `id${++this.seq}`, source, message, startedAt });
    this.rowsBySource.set(source, list);
  }
  async update(id: string, message: string) {
    this.updates++;
    for (const list of this.rowsBySource.values()) for (const r of list) if (r.id === id) r.message = message;
  }
  async remove(ids: string[]) {
    for (const [k, list] of this.rowsBySource) this.rowsBySource.set(k, list.filter((r) => !ids.includes(r.id)));
  }
  all() {
    return [...this.rowsBySource.values()].flat();
  }
}

test("the date key is the India calendar day, not the UTC day", () => {
  assert.equal(istDateKey(new Date("2026-10-08T12:00:00Z")), "2026-10-08");
  assert.equal(istDateKey(new Date("2026-10-08T19:00:00Z")), "2026-10-09", "00:30 IST on the 9th");
  assert.equal(istDateKey(new Date("2026-10-08T18:29:00Z")), "2026-10-08", "23:59 IST on the 8th");
});

test("the ALL snapshot carries the same counts as the live coverage summary", () => {
  const s = buildSnapshots(rows(), now);
  const live = summarizeCoverage(rows(), now);
  const all = s.entries.find((e) => e.scope === ALL_SCOPE)!;
  assert.deepEqual(all.counts, live.overall);
  assert.equal(all.counts.total, 7);
  assert.equal(all.counts.duplicate, 1);
  assert.equal(all.counts.removed, 1);
  assert.equal(all.counts.stale, 1);
  assert.equal(all.counts.current, 4, "alpha 1 and 2, beta 1, the manual one");
  assert.equal(all.counts.actionable, 3, "alpha 1, beta 1, the manual one");
});

test("per-source snapshots add up to the ALL snapshot, field by field", () => {
  const s = buildSnapshots(rows(), now);
  const parts = s.entries.filter((e) => e.scope !== ALL_SCOPE);
  const all = s.entries.find((e) => e.scope === ALL_SCOPE)!;
  for (const k of Object.keys(all.counts) as (keyof typeof all.counts)[]) {
    assert.equal(parts.reduce((n, p) => n + p.counts[k], 0), all.counts[k], `sum of sources for ${k}`);
  }
  assert.deepEqual(parts.map((p) => p.scope).sort(), ["(manual / unknown)", "alpha.in", "beta.in"]);
});

test("a source with no rows today has no entry, an empty database still gets an ALL entry of zeros", () => {
  const s = buildSnapshots([], now);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].scope, ALL_SCOPE);
  assert.equal(s.entries[0].counts.actionable, 0);
});

test("overlap counters are attached to the matching source and only there", () => {
  const s = buildSnapshots(rows(), now, new Map([["alpha.in", { created: 10, duplicates: 30, rejected: 5 }]]));
  assert.deepEqual(s.entries.find((e) => e.scope === "alpha.in")!.overlap, { created: 10, duplicates: 30, rejected: 5 });
  assert.equal(s.entries.find((e) => e.scope === "beta.in")!.overlap, undefined);
  assert.equal(s.entries.find((e) => e.scope === ALL_SCOPE)!.overlap, undefined);
});

test("writing twice on the same date leaves ONE row per source, holding the latest reading", async () => {
  const store = new MemoryStore();
  await writeSnapshots(store, buildSnapshots(rows(), now));
  const first = store.all().length;
  assert.equal(first, 4, "ALL + three sources");
  const changed = rows().concat(row({ externalId: "src:beta.in:9", sourceUrl: "https://beta.in/9" }));
  await writeSnapshots(store, buildSnapshots(changed, new Date(now.getTime() + 3_600_000)));
  assert.equal(store.all().length, first, "no new rows");
  const all = parseSnapshot(store.all().find((r) => r.source === snapshotSource("2026-10-08", ALL_SCOPE))!.message)!;
  assert.equal(all.counts.total, 8, "the later reading replaced the earlier one");
  assert.equal(store.creates, 4);
  assert.equal(store.updates, 4);
});

test("a different date adds new rows and leaves yesterday's untouched", async () => {
  const store = new MemoryStore();
  await writeSnapshots(store, buildSnapshots(rows(), now));
  const yesterday = store.all().map((r) => r.message);
  await writeSnapshots(store, buildSnapshots(rows(), new Date(now.getTime() + day)));
  assert.equal(store.all().length, 8);
  assert.deepEqual(store.all().slice(0, 4).map((r) => r.message), yesterday);
});

test("a race that created two rows for the same source/date is healed: the earliest stays, the rest go", async () => {
  const store = new MemoryStore();
  const src = snapshotSource("2026-10-08", ALL_SCOPE);
  store.rowsBySource.set(src, [
    { id: "b", source: src, message: "{}", startedAt: new Date("2026-10-08T12:00:02Z") },
    { id: "a", source: src, message: "{}", startedAt: new Date("2026-10-08T12:00:01Z") },
  ]);
  await writeSnapshots(store, buildSnapshots(rows(), now));
  const left = store.rowsBySource.get(src)!;
  assert.deepEqual(left.map((r) => r.id), ["a"]);
  assert.equal(parseSnapshot(left[0].message)!.counts.total, 7);
});

test("a stored snapshot round-trips; garbage and other messages do not parse", () => {
  const s = buildSnapshots(rows(), now);
  const msg = JSON.stringify({ v: 1, date: s.date, scope: ALL_SCOPE, counts: s.entries[0].counts });
  assert.equal(parseSnapshot(msg)!.counts.actionable, 3);
  assert.equal(parseSnapshot("not json"), null);
  assert.equal(parseSnapshot(JSON.stringify({ v: 1, date: "x" })), null);
  assert.equal(parseSnapshot(null), null);
});

test("trend lists days oldest first, with the change from the previous reading, and flags missing days", () => {
  const mk = (date: string, actionable: number) => ({ v: 1 as const, date, scope: ALL_SCOPE, counts: { total: 100, duplicate: 0, removed: 0, unique: 100, published: 100, current: 60, stale: 5, actionable } });
  const t = trendOf([mk("2026-10-10", 140), mk("2026-10-08", 100), mk("2026-10-09", 120)]);
  assert.deepEqual(t.map((x) => [x.date, x.counts.actionable, x.change]), [["2026-10-08", 100, null], ["2026-10-09", 120, 20], ["2026-10-10", 140, 20]]);
  const gap = trendOf([mk("2026-10-08", 100), mk("2026-10-11", 90)]);
  assert.equal(gap[1].change, -10);
  assert.equal(gap[1].gapDays, 2, "two days with no reading in between");
  assert.equal(gap[0].gapDays, 0);
});

test("snapshot rows are their own kind and cannot be mistaken for a source run", () => {
  assert.equal(SNAPSHOT_KIND, "coverage-snapshot");
  assert.ok(snapshotSource("2026-10-08", "alpha.in").startsWith("Coverage snapshot"));
});

/* ---- wiring guards ---- */

test("run-log housekeeping keeps snapshots far longer than the 60-day run rows", () => {
  const s = read("src/lib/pipeline/runLog.ts");
  assert.match(s, /deleteMany\(\{ where: \{ startedAt: \{ lt: new Date\(Date\.now\(\) - 60 \* 864e5\) \}, kind: \{ not: "coverage-snapshot" \}/);
});

test("snapshot rows are kept out of the run-history and 24-hour views", () => {
  assert.match(read("src/app/admin/(shell)/engine/history/page.tsx"), /notIn: \[[^\]]*"coverage-snapshot"/);
  assert.match(read("src/app/admin/(shell)/engine/page.tsx"), /kind: \{ not: "coverage-snapshot" \}/);
});

test("the snapshot is taken by the tick, after the clean-up, and a failure cannot fail the tick", () => {
  const s = read("src/lib/pipeline/tick.ts");
  assert.match(s, /snapshotCoverageIfDue/);
  assert.ok(s.indexOf("autoCleanExactDuplicates()") < s.indexOf("snapshotCoverageIfDue("), "after duplicates are cleaned");
  assert.match(s, /snapshotCoverageIfDue\([^)]*\)\.catch\(/);
});

test("the Prisma store never touches listings, auctions or sources", () => {
  const s = read("src/lib/pipeline/coverageHistoryStore.ts");
  assert.doesNotMatch(s, /\.(property|auction|propertyChange|feedSource|source)\.(update|updateMany|delete|deleteMany|create|upsert)/);
  assert.doesNotMatch(s, /status:\s*"(REMOVED|DUPLICATE|HIDDEN)"/);
});

test("the coverage page shows the history", () => {
  const s = read("src/app/admin/(shell)/engine/coverage/page.tsx");
  assert.match(s, /loadCoverageTrend|trendOf/);
  assert.match(s, /Daily history/);
});
