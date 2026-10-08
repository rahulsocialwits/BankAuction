import type { AuctionStatus } from "@prisma/client";

/*
 * Auction status resolution (pure, no database).
 *
 * deriveAuctionStatusFromDates() only knows dates, so on its own it can never say POSTPONED or CANCELLED, and every
 * re-import would overwrite a postponed/cancelled auction back to UPCOMING. This module adds the missing rules:
 *
 *   1. An explicit POSTPONED / CANCELLED signal (from the source, or set by an admin) wins.
 *   2. A POSTPONED / CANCELLED auction STAYS that way on later runs, until the auction date actually changes
 *      (a new date means it was rescheduled / re-listed), then the date-derived status applies again.
 *   3. Otherwise the date-derived status applies.
 *
 * Explicit signals are only ever read from a field a source (or admin) deliberately provides. Free page text is NOT scanned:
 * boilerplate such as "EMD is refunded if the auction is cancelled" would cause false cancellations.
 */

export type ExplicitAuctionStatus = "POSTPONED" | "CANCELLED";
const HELD: ReadonlySet<AuctionStatus> = new Set<AuctionStatus>(["POSTPONED", "CANCELLED"]);

/** Reads a status value a source or admin provided ("Postponed", "CANCELLED", "auction cancelled", "withdrawn"). Anything else gives null. */
export function detectExplicitStatus(value: string | null | undefined): ExplicitAuctionStatus | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v || v.length > 60) return null; // a status field is short; long text is a description, not a status
  if (/\b(cancel+ed|cancellation|withdrawn|called off)\b/.test(v)) return "CANCELLED";
  if (/\b(postponed|adjourned|deferred|put on hold)\b/.test(v)) return "POSTPONED";
  return null;
}

const sameInstant = (a: Date | null | undefined, b: Date | null | undefined) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

/** True when a NEW auction start is supplied and differs from the stored one. A missing new date is not a change. */
export const auctionDateChanged = (stored: Date | null | undefined, incoming: Date | null | undefined): boolean => !!incoming && !sameInstant(stored, incoming);

export function resolveAuctionStatus(input: {
  current: AuctionStatus | null | undefined;
  derived: AuctionStatus;
  explicit?: ExplicitAuctionStatus | null;
  dateChanged?: boolean;
}): AuctionStatus {
  if (input.explicit) return input.explicit;
  if (input.current && HELD.has(input.current) && !input.dateChanged) return input.current;
  return input.derived;
}

/** True when a status was kept because of rule 2 (so callers should not relabel its statusSource as date-derived). */
export const isHeldStatus = (status: AuctionStatus | null | undefined): boolean => !!status && HELD.has(status);
