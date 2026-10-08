/*
 * Prisma edge of the daily coverage history (see coverageHistory.ts). It reads auctions and run counters and writes ONLY
 * SourceRunLog rows of kind "coverage-snapshot". It never changes a listing, an auction or a source.
 */

import { prisma } from "@/lib/db/prisma";
import type { CoverageAuctionRow } from "./coverage";
import {
  ALL_SCOPE,
  SNAPSHOT_KIND,
  buildSnapshots,
  istDateKey,
  parseSnapshot,
  snapshotSource,
  trendOf,
  writeSnapshots,
  type SnapshotOverlap,
  type SnapshotPayload,
  type SnapshotStore,
  type StoredSnapshot,
  type TrendPoint,
} from "./coverageHistory";

const MAX_ROWS = 100_000; // same ceiling as the Coverage page

export const prismaSnapshotStore: SnapshotStore = {
  async findAll(source) {
    const rows = (await prisma.sourceRunLog.findMany({ where: { kind: SNAPSHOT_KIND, source }, select: { id: true, source: true, message: true, startedAt: true } })) as unknown as StoredSnapshot[];
    return rows;
  },
  async create(source, message, startedAt) {
    await prisma.sourceRunLog.create({ data: { source, kind: SNAPSHOT_KIND, trigger: "schedule", status: "ok", message, startedAt } });
  },
  async update(id, message) {
    // startedAt doubles as "time of the latest reading", which is what snapshotCoverageIfDue compares
    await prisma.sourceRunLog.update({ where: { id }, data: { message, startedAt: new Date() } });
  },
  async remove(ids) {
    await prisma.sourceRunLog.deleteMany({ where: { id: { in: ids }, kind: SNAPSHOT_KIND } });
  },
};

interface AuctionQueryRow {
  externalAuctionId: string | null;
  sourceUrl: string | null;
  status: string;
  auctionStart: Date | null;
  auctionEnd: Date | null;
  reservePrice: unknown;
  property: { status: string; addressText: string | null; geoCity: string | null };
}

export async function loadCoverageRows(): Promise<CoverageAuctionRow[]> {
  const raw = (await prisma.auction.findMany({
    take: MAX_ROWS,
    select: { externalAuctionId: true, sourceUrl: true, status: true, auctionStart: true, auctionEnd: true, reservePrice: true, property: { select: { status: true, addressText: true, geoCity: true } } },
  })) as unknown as AuctionQueryRow[];
  return raw.map((a) => ({
    externalId: a.externalAuctionId,
    sourceUrl: a.sourceUrl,
    auctionStatus: a.status,
    auctionStart: a.auctionStart,
    auctionEnd: a.auctionEnd,
    reservePrice: a.reservePrice,
    propertyStatus: a.property.status,
    hasAddress: !!(a.property.addressText?.trim() || a.property.geoCity?.trim()),
  }));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * 30-day overlap counters per source key, only where the counters are per-run amounts. BAANKNET logs running totals each tick
 * (see the Coverage page), so it is left out rather than shown inflated.
 */
async function overlapBySource(now: Date): Promise<Map<string, SnapshotOverlap>> {
  const out = new Map<string, SnapshotOverlap>();
  const since = new Date(now.getTime() - 30 * 864e5);
  const feeds = (await prisma.feedSource.findMany({ select: { name: true, url: true } })) as unknown as { name: string; url: string }[];
  const keyByName = new Map<string, string>([["BankAuctions.in", "bankauctions.in"]]);
  const cumulative: string[] = [];
  for (const f of feeds) {
    const h = hostOf(f.url);
    if (!h) continue;
    if (/(^|\.)baanknet\.com$/.test(h)) cumulative.push(f.name);
    else keyByName.set(f.name, h);
  }
  const groups = (await prisma.sourceRunLog.groupBy({
    by: ["source"],
    where: { startedAt: { gte: since }, kind: { in: ["builtin", "feed", "csv"] }, status: "ok", source: { notIn: cumulative } },
    _sum: { created: true, duplicates: true, rejected: true },
  })) as unknown as { source: string; _sum: { created: number | null; duplicates: number | null; rejected: number | null } }[];
  for (const g of groups) {
    const key = keyByName.get(g.source);
    if (!key) continue;
    const cur = out.get(key) ?? { created: 0, duplicates: 0, rejected: 0 };
    cur.created += g._sum.created ?? 0;
    cur.duplicates += g._sum.duplicates ?? 0;
    cur.rejected += g._sum.rejected ?? 0;
    out.set(key, cur);
  }
  return out;
}

/** Takes (or refreshes) today's reading. */
export async function takeCoverageSnapshot(now: Date = new Date()) {
  const rows = await loadCoverageRows();
  const overlap = await overlapBySource(now).catch(() => new Map<string, SnapshotOverlap>());
  return writeSnapshots(prismaSnapshotStore, buildSnapshots(rows, now, overlap), now);
}

/**
 * Called from the tick. Cheap when today's reading exists and is fresh: one indexed lookup. The reading is refreshed at most once
 * every 6 hours so the day's last reading ends up close to the end of the day without reading all auctions on every tick.
 */
export const SNAPSHOT_REFRESH_MS = 6 * 3_600_000;

export async function snapshotCoverageIfDue(now: Date = new Date()): Promise<"taken" | "fresh"> {
  const todays = (await prismaSnapshotStore.findAll(snapshotSource(istDateKey(now), ALL_SCOPE))) as StoredSnapshot[];
  const last = todays.reduce<number>((m, r) => Math.max(m, r.startedAt.getTime()), 0);
  if (todays.length > 0 && now.getTime() - last < SNAPSHOT_REFRESH_MS) return "fresh";
  await takeCoverageSnapshot(now);
  return "taken";
}

/** Readings for the admin: the ALL scope plus every source, newest `days` days. */
export async function loadCoverageTrend(days = 30): Promise<{ all: TrendPoint[]; bySource: Map<string, TrendPoint[]> }> {
  const since = new Date(Date.now() - (days + 1) * 864e5);
  const raw = (await prisma.sourceRunLog.findMany({ where: { kind: SNAPSHOT_KIND, startedAt: { gte: since } }, select: { message: true }, take: 5000 })) as unknown as { message: string | null }[];
  const parsed = raw.map((r) => parseSnapshot(r.message)).filter((p): p is SnapshotPayload => p !== null);
  const byScope = new Map<string, SnapshotPayload[]>();
  for (const p of parsed) byScope.set(p.scope, [...(byScope.get(p.scope) ?? []), p]);
  const all = trendOf(byScope.get(ALL_SCOPE) ?? []).slice(-days);
  const bySource = new Map<string, TrendPoint[]>();
  for (const [scope, pts] of byScope) if (scope !== ALL_SCOPE) bySource.set(scope, trendOf(pts).slice(-days));
  return { all, bySource };
}
