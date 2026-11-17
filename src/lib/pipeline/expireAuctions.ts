/**
 * Expire stale auctions: marks open auctions whose auction date was more than EXPIRY_GRACE_DAYS ago as EXPIRED.
 *
 * Purpose: prevent ended auctions from appearing as upcoming forever when no source will update them again
 * (a listing that has left its source is never re-imported, so the stored status stays UPCOMING indefinitely).
 *
 * Rules:
 * - Only transitions UPCOMING / LIVE / AUCTION_TODAY → EXPIRED.
 * - Skips POSTPONED, CANCELLED, COMPLETED, EXPIRED, and any auction with no auctionStart date.
 * - Never hard-deletes records.
 * - Idempotent: running it twice produces the same result.
 * - Writes one AuctionEvent row per changed auction for auditability.
 */

import { prisma } from "@/lib/db/prisma";
import type { AuctionStatus } from "@prisma/client";

export const EXPIRY_GRACE_DAYS = 7;

export interface ExpireResult {
  expired: number;
  cutoffDate: Date;
}

const OPEN_STATUSES: AuctionStatus[] = ["UPCOMING", "LIVE", "AUCTION_TODAY"];

export async function expireStaleAuctions(now: Date = new Date()): Promise<ExpireResult> {
  const cutoffDate = new Date(now.getTime() - EXPIRY_GRACE_DAYS * 24 * 3_600_000);

  // Find all open auctions whose auction start was more than EXPIRY_GRACE_DAYS ago.
  const stale = await prisma.auction.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      auctionStart: { lt: cutoffDate },
    },
    select: { id: true, status: true },
  });

  if (stale.length === 0) return { expired: 0, cutoffDate };

  // Update all at once, then write AuctionEvent rows individually.
  await prisma.auction.updateMany({
    where: { id: { in: stale.map((a) => a.id) } },
    data: { status: "EXPIRED" },
  });

  await prisma.auctionEvent.createMany({
    data: stale.map((a) => ({
      auctionId: a.id,
      fromStatus: a.status,
      toStatus: "EXPIRED" as AuctionStatus,
      reason: `Auto-expired: auction date was more than ${EXPIRY_GRACE_DAYS} days ago`,
    })),
    skipDuplicates: true,
  });

  return { expired: stale.length, cutoffDate };
}
