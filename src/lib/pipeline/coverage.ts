/*
 * Coverage intelligence (Phase 3C). Pure functions, no database.
 *
 * Primary metric: CURRENT UNIQUE ACTIONABLE AUCTIONS = auctions that are unique (not a duplicate, not removed), published,
 * still current, and carry the three fields a buyer needs to act (reserve price, auction date, an address).
 * Every other count explains the gap between "rows in the database" and that number.
 *
 * Definitions (one auction round = one Auction row):
 *   total        every Auction row
 *   duplicate    its Property is marked DUPLICATE
 *   removed      its Property is REMOVED (hidden by an admin or a safe clean-up)
 *   unique       total - duplicate - removed
 *   published    unique AND Property is PUBLISHED
 *   current      published AND still open: UPCOMING / LIVE / AUCTION_TODAY with a date that is not over, or POSTPONED
 *   stale        published AND stored as open (UPCOMING / LIVE / AUCTION_TODAY) but its date is over (see auctionLifecycle.ts).
 *                The website already shows these as ended; the stored value just has not been refreshed by an import.
 *   actionable   current AND reserve price AND auction date AND an address are all present
 * "Source" of an auction is the source that CREATED it (host of its source-qualified id or source URL). Later enrichments by other
 * sources are not tracked (there is no per-field provenance yet), so "unique contribution" means "first to find it".
 */

import { isAuctionOver } from "@/lib/domain/auctionLifecycle";

/** Kept for callers and tests; "over" now uses the shared rule in auctionLifecycle.ts (after auctionEnd, else after the auction's IST day). */
export const STALE_GRACE_MS = 24 * 3_600_000;

export interface CoverageAuctionRow {
  externalId: string | null;
  sourceUrl: string | null;
  auctionStatus: string; // AuctionStatus
  auctionStart: Date | null;
  auctionEnd: Date | null;
  reservePrice: unknown; // Decimal | number | string | null
  propertyStatus: string; // PropertyStatus
  hasAddress: boolean;
}

export type AuctionClass = {
  duplicate: boolean;
  removed: boolean;
  unique: boolean;
  published: boolean;
  current: boolean;
  stale: boolean;
  actionable: boolean;
};

const OPEN = new Set(["UPCOMING", "LIVE", "AUCTION_TODAY"]);

/** Stable name of the source that created an auction: the host in `src:<host>:<id>`, else the host of its URL, else "(manual / unknown)". */
export function sourceKeyOf(row: Pick<CoverageAuctionRow, "externalId" | "sourceUrl">): string {
  const m = /^src:([^:]+):/i.exec(row.externalId ?? "");
  if (m) return m[1].toLowerCase().replace(/^www\./, "");
  try {
    if (row.sourceUrl) return new URL(row.sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    /* not a URL */
  }
  return "(manual / unknown)";
}

const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "" && Number(v) > 0;

export function classifyAuction(row: CoverageAuctionRow, now: Date = new Date()): AuctionClass {
  const duplicate = row.propertyStatus === "DUPLICATE";
  const removed = row.propertyStatus === "REMOVED";
  const unique = !duplicate && !removed;
  const published = unique && row.propertyStatus === "PUBLISHED";
  const datePassed = isAuctionOver(row.auctionStart, row.auctionEnd, now);
  const open = OPEN.has(row.auctionStatus);
  const current = published && ((open && !datePassed) || row.auctionStatus === "POSTPONED");
  const stale = published && open && datePassed;
  const actionable = current && hasValue(row.reservePrice) && !!row.auctionStart && row.hasAddress;
  return { duplicate, removed, unique, published, current, stale, actionable };
}

export interface CoverageCounts {
  total: number;
  duplicate: number;
  removed: number;
  unique: number;
  published: number;
  current: number;
  stale: number;
  actionable: number;
}

const zero = (): CoverageCounts => ({ total: 0, duplicate: 0, removed: 0, unique: 0, published: 0, current: 0, stale: 0, actionable: 0 });

function add(into: CoverageCounts, c: AuctionClass) {
  into.total++;
  if (c.duplicate) into.duplicate++;
  if (c.removed) into.removed++;
  if (c.unique) into.unique++;
  if (c.published) into.published++;
  if (c.current) into.current++;
  if (c.stale) into.stale++;
  if (c.actionable) into.actionable++;
}

export interface CoverageSummary {
  overall: CoverageCounts;
  bySource: { source: string; counts: CoverageCounts; shareOfActionable: number }[];
}

/** Totals and a per-source breakdown, sources ordered by actionable auctions (then total). */
export function summarizeCoverage(rows: CoverageAuctionRow[], now: Date = new Date()): CoverageSummary {
  const overall = zero();
  const map = new Map<string, CoverageCounts>();
  for (const r of rows) {
    const c = classifyAuction(r, now);
    add(overall, c);
    const key = sourceKeyOf(r);
    let s = map.get(key);
    if (!s) map.set(key, (s = zero()));
    add(s, c);
  }
  const bySource = [...map.entries()]
    .map(([source, counts]) => ({ source, counts, shareOfActionable: overall.actionable ? counts.actionable / overall.actionable : 0 }))
    .sort((a, b) => b.counts.actionable - a.counts.actionable || b.counts.total - a.counts.total || a.source.localeCompare(b.source));
  return { overall, bySource };
}

/* ---- overlap and incremental value, from run-log counters ---- */

export interface RunCounters {
  created: number; //    new auctions the run wrote
  duplicates: number; // valid records that matched an existing auction
  rejected: number; //   records that failed the quality gate or were out of scope
}

export interface SourceOverlap {
  discovered: number; // created + duplicates + rejected (what the runs presented)
  valid: number; //      created + duplicates
  created: number;
  duplicates: number;
  rejected: number;
  /** duplicates / valid: how much of what the source shows we already had. Null when nothing valid was seen. */
  overlapRatio: number | null;
  /** created / valid: how much of what the source shows was new to us. Null when nothing valid was seen. */
  uniqueRatio: number | null;
}

/**
 * Overlap of a source over a window of runs. Example: a source shows 4,000 valid listings and 3,500 were already held:
 * created 500, duplicates 3,500, overlap 87.5%, unique 12.5%.
 * Caveat (shown in the admin): runs re-read the same listings, so over a long window the same existing listing is counted as a
 * duplicate once per read. For a first-pass comparison use a window that holds one pass.
 */
export function overlapOf(runs: RunCounters[]): SourceOverlap {
  let created = 0, duplicates = 0, rejected = 0;
  for (const r of runs) {
    created += Math.max(0, r.created || 0);
    duplicates += Math.max(0, r.duplicates || 0);
    rejected += Math.max(0, r.rejected || 0);
  }
  const valid = created + duplicates;
  return {
    discovered: valid + rejected,
    valid,
    created,
    duplicates,
    rejected,
    overlapRatio: valid > 0 ? duplicates / valid : null,
    uniqueRatio: valid > 0 ? created / valid : null,
  };
}

/** Percentage text, or an em dash when not measurable. */
export const pct = (ratio: number | null | undefined, digits = 0) => (ratio === null || ratio === undefined ? "—" : `${(ratio * 100).toFixed(digits)}%`);
