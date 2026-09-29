import { AuctionStatus } from "@prisma/client";

/**
 * Date-derived status only. Per spec §10, explicit source-provided
 * cancellation/postponement must override this — callers should check for
 * that signal first and only fall back to this function when the source
 * gives no explicit status.
 */
export function deriveAuctionStatusFromDates(
  auctionStart: Date | null,
  auctionEnd: Date | null,
  now: Date = new Date()
): AuctionStatus {
  if (!auctionStart) return "UPCOMING";

  const end = auctionEnd ?? auctionStart;
  if (now > end) return "COMPLETED";

  const startOfAuctionDay = new Date(auctionStart);
  startOfAuctionDay.setUTCHours(0, 0, 0, 0);
  const endOfAuctionDay = new Date(startOfAuctionDay);
  endOfAuctionDay.setUTCDate(endOfAuctionDay.getUTCDate() + 1);

  if (now >= auctionStart && now <= end) return "LIVE";
  if (now >= startOfAuctionDay && now < endOfAuctionDay) return "AUCTION_TODAY";
  return "UPCOMING";
}
