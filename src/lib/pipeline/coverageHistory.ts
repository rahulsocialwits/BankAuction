/*
 * Daily coverage history (Phase 3, PR 6). Pure logic, no database.
 *
 * One small reading per source per India calendar day, so the admin can answer "was it 100 current unique actionable auctions on
 * Oct 8, and how many on Oct 9?". Readings are the same numbers the Coverage page shows (summarizeCoverage), nothing new is measured.
 *
 * Storage (see coverageHistoryStore.ts): one SourceRunLog row per (date, scope) with kind "coverage-snapshot" and the JSON below in
 * its message. No schema change. Taking a reading again on the same date REWRITES that day's row (latest reading of the day wins);
 * it never adds a second one. Scope "ALL" is the whole database, other scopes are the source that first found the auction.
 */

import { summarizeCoverage, type CoverageAuctionRow, type CoverageCounts } from "./coverage";

export const SNAPSHOT_KIND = "coverage-snapshot";
export const ALL_SCOPE = "ALL";
export const SNAPSHOT_VERSION = 1 as const;

/** Overlap counters of a source over the reporting window (where the engine already measures them). */
export interface SnapshotOverlap {
  created: number;
  duplicates: number;
  rejected: number;
}

export interface SnapshotEntry {
  scope: string; // ALL or a source key from sourceKeyOf
  counts: CoverageCounts;
  overlap?: SnapshotOverlap;
}

export interface SnapshotPayload {
  v: typeof SNAPSHOT_VERSION;
  date: string; // YYYY-MM-DD, India calendar day
  scope: string;
  counts: CoverageCounts;
  overlap?: SnapshotOverlap;
}

const IST_OFFSET_MS = 330 * 60_000;

/** The India calendar date (YYYY-MM-DD) of an instant. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The run-log `source` value that identifies one reading: unique per date and scope. */
export const snapshotSource = (date: string, scope: string) => `Coverage snapshot ${date} · ${scope}`;

export function buildSnapshots(rows: CoverageAuctionRow[], now: Date, overlapBySource?: Map<string, SnapshotOverlap>): { date: string; entries: SnapshotEntry[] } {
  const summary = summarizeCoverage(rows, now);
  const entries: SnapshotEntry[] = [{ scope: ALL_SCOPE, counts: summary.overall }];
  for (const s of summary.bySource) {
    const overlap = overlapBySource?.get(s.source);
    entries.push({ scope: s.source, counts: s.counts, ...(overlap ? { overlap } : {}) });
  }
  return { date: istDateKey(now), entries };
}

export interface StoredSnapshot {
  id: string;
  source: string;
  message: string | null;
  startedAt: Date;
}

/** The only operations the writer needs. The Prisma implementation is a few lines each; tests use a Map. */
export interface SnapshotStore {
  findAll(source: string): Promise<StoredSnapshot[]>;
  create(source: string, message: string, startedAt: Date): Promise<void>;
  update(id: string, message: string): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

/**
 * Idempotent per (date, scope): updates the existing row, creates it if missing. If a race left more than one row for the same
 * (date, scope), the earliest is kept and updated and the others are deleted.
 */
export async function writeSnapshots(store: SnapshotStore, snap: { date: string; entries: SnapshotEntry[] }, at: Date = new Date()): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const e of snap.entries) {
    const source = snapshotSource(snap.date, e.scope);
    const payload: SnapshotPayload = { v: SNAPSHOT_VERSION, date: snap.date, scope: e.scope, counts: e.counts, ...(e.overlap ? { overlap: e.overlap } : {}) };
    const message = JSON.stringify(payload);
    const existing = (await store.findAll(source)).slice().sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id));
    if (existing.length === 0) {
      await store.create(source, message, at);
      created++;
      continue;
    }
    await store.update(existing[0].id, message);
    updated++;
    if (existing.length > 1) await store.remove(existing.slice(1).map((r) => r.id));
  }
  return { created, updated };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const COUNT_KEYS = ["total", "duplicate", "removed", "unique", "published", "current", "stale", "actionable"] as const;

/** Parses a stored message; null for anything that is not a valid reading. */
export function parseSnapshot(message: string | null | undefined): SnapshotPayload | null {
  if (!message) return null;
  try {
    const j = JSON.parse(message) as Partial<SnapshotPayload> & { counts?: Record<string, unknown> };
    if (j.v !== SNAPSHOT_VERSION || typeof j.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(j.date) || typeof j.scope !== "string" || !j.counts) return null;
    const counts = {} as CoverageCounts;
    for (const k of COUNT_KEYS) {
      const v = num(j.counts[k]);
      if (v === null) return null;
      counts[k] = v;
    }
    const o = j.overlap;
    const overlap = o && num(o.created) !== null && num(o.duplicates) !== null && num(o.rejected) !== null ? { created: o.created, duplicates: o.duplicates, rejected: o.rejected } : undefined;
    return { v: SNAPSHOT_VERSION, date: j.date, scope: j.scope, counts, ...(overlap ? { overlap } : {}) };
  } catch {
    return null;
  }
}

export interface TrendPoint extends SnapshotPayload {
  /** change in current unique actionable auctions since the previous reading; null for the first */
  change: number | null;
  /** whole days without any reading between this point and the previous one */
  gapDays: number;
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 864e5);

/** Readings of ONE scope, oldest first, with the day-to-day change. Duplicate dates keep the last one given. */
export function trendOf(points: SnapshotPayload[]): TrendPoint[] {
  const byDate = new Map<string, SnapshotPayload>();
  for (const p of points) byDate.set(p.date, p);
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    return {
      ...p,
      change: prev ? p.counts.actionable - prev.counts.actionable : null,
      gapDays: prev ? Math.max(0, dayNumber(p.date) - dayNumber(prev.date) - 1) : 0,
    };
  });
}
