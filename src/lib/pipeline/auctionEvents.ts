import { prisma } from "@/lib/db/prisma";
import type { AuctionStatus } from "@prisma/client";

/** Writes one AuctionEvent row (status-transition history). Never throws: history must not break an import. */
export async function recordAuctionStatusChange(auctionId: string, from: AuctionStatus | null | undefined, to: AuctionStatus, reason: string): Promise<void> {
  if (from === to) return;
  try {
    await prisma.auctionEvent.create({ data: { auctionId, fromStatus: from ?? null, toStatus: to, reason: reason.slice(0, 300) } });
  } catch {
    /* ignore */
  }
}
