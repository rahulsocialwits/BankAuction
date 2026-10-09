/*
 * Read-time auction lifecycle (pure, no database).
 *
 * The STORED status of an auction is written only when an import touches the listing (deriveAuctionStatusFromDates +
 * resolveAuctionStatus). Nothing updates it as time passes, so an auction that was UPCOMING when last imported stays UPCOMING
 * in the database after its date, until a source happens to be read again. A listing that has left its source (the usual case
 * for ended auctions) is never read again, so it would be shown as "upcoming" forever.
 *
 * Rather than rewriting thousands of rows, every place that SHOWS or FILTERS by status uses the functions below. They treat an
 * auction as ended as soon as its date is clearly over (OPEN -> COMPLETED), and they move a stored UPCOMING / AUCTION_TODAY auction
 * FORWARD once its time has come (UPCOMING -> AUCTION_TODAY -> LIVE), because the stored value is only written when an import touches
 * the listing. They never touch:
 *   - POSTPONED / CANCELLED (an explicit decision, held until the date changes: see resolveAuctionStatus),
 *   - COMPLETED / EXPIRED (already ended),
 *   - an auction with no date at all (nothing says it is over),
 * and never write anything: no record is deleted, hidden or modified, and AuctionEvent history is not involved.
 * Each auction round (re-auction) is judged on its own dates, so an old round is ended while the new round stays open.
 *
 * Forward rules for a stored UPCOMING or AUCTION_TODAY auction that is not over (all in India time, nothing is guessed):
 *   - start has passed and an end exists (a bidding window such as 7 Oct 11:00 to 16 Oct 13:00)  -> LIVE
 *   - start has passed and no end exists (a one-day auction, still inside its day)               -> AUCTION_TODAY
 *   - start is later today (IST)                                                                  -> AUCTION_TODAY
 *   - start is on a later day, or there is no start                                               -> the stored status, unchanged
 * A stored LIVE auction stays LIVE until it is over. Backward moves never happen (no LIVE -> UPCOMING).
 *
 * "Over": after auctionEnd if there is one, otherwise after the end of the auction's calendar day in India (IST). Sources often
 * give only a date, and bank auctions run through the working day, so an auction is not over on the morning it takes place.
 */

export type AuctionStatusName = "UPCOMING" | "LIVE" | "AUCTION_TODAY" | "COMPLETED" | "POSTPONED" | "CANCELLED" | "EXPIRED";

export const OPEN_STATUSES = ["UPCOMING", "LIVE", "AUCTION_TODAY"] as const satisfies readonly AuctionStatusName[];
const OPEN: ReadonlySet<string> = new Set(OPEN_STATUSES);
export const isOpenStatus = (s: string | null | undefined): boolean => !!s && OPEN.has(s);

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 864e5;

/** 00:00 IST of the Indian calendar day that contains `d`, as an instant. */
export function istDayStart(d: Date): Date {
  const shifted = d.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** True when the auction is clearly over: past auctionEnd, or (no end) past the end of its IST day. No dates at all: never over. */
export function isAuctionOver(auctionStart: Date | null | undefined, auctionEnd: Date | null | undefined, now: Date = new Date()): boolean {
  if (auctionEnd) return auctionEnd.getTime() < now.getTime();
  if (auctionStart) return istDayStart(auctionStart).getTime() + DAY_MS <= now.getTime();
  return false;
}

const todayEnd = (now: Date): Date => new Date(istDayStart(now).getTime() + DAY_MS); // 00:00 IST tomorrow

/**
 * The status to show and to filter by: the stored one, except that
 *  - an open auction whose date is over is COMPLETED, and
 *  - a stored UPCOMING / AUCTION_TODAY auction that is not over moves forward once its start has come (see the rules above).
 * auctionStatusWhere below expresses exactly the same rules as a database filter; tests/auctionLifecycle.test.ts checks they agree.
 */
export function effectiveAuctionStatus<T extends AuctionStatusName>(
  a: { status: T; auctionStart: Date | null | undefined; auctionEnd?: Date | null },
  now: Date = new Date(),
): T | "COMPLETED" | "LIVE" | "AUCTION_TODAY" {
  if (!isOpenStatus(a.status)) return a.status;
  if (isAuctionOver(a.auctionStart, a.auctionEnd, now)) return "COMPLETED";
  if (a.status === "LIVE" || !a.auctionStart) return a.status;
  if (a.auctionStart.getTime() <= now.getTime()) return a.auctionEnd ? "LIVE" : "AUCTION_TODAY";
  if (a.auctionStart.getTime() < todayEnd(now).getTime()) return "AUCTION_TODAY";
  return a.status;
}

/* ---- the same rules as database filters (the filters and effectiveAuctionStatus must always agree: see the tests) ---- */

type DateRange = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };
type NotOverClause = { auctionEnd: { gte: Date } } | { auctionEnd: null; auctionStart: { gte: Date } } | { auctionEnd: null; auctionStart: null };
type OverClause = { auctionEnd: { lt: Date } } | { auctionEnd: null; auctionStart: { lt: Date } };
type StatusClause = { status: { in: AuctionStatusName[] } };
type DateClause = { auctionStart?: DateRange | null; auctionEnd?: DateRange | null };
type Clause = StatusClause | DateClause | { OR: Array<DateClause | NotOverClause | OverClause> };
type AuctionStatusFilter = { OR: Array<StatusClause | { AND: Clause[] }> };

const notOver = (now: Date): { OR: NotOverClause[] } => ({
  OR: [{ auctionEnd: { gte: now } }, { auctionEnd: null, auctionStart: { gte: istDayStart(now) } }, { auctionEnd: null, auctionStart: null }],
});
const over = (now: Date): { OR: OverClause[] } => ({
  OR: [{ auctionEnd: { lt: now } }, { auctionEnd: null, auctionStart: { lt: istDayStart(now) } }],
});

/**
 * Where-fragment for auctions whose EFFECTIVE status is one of `statuses`. Put it in an AND list:
 *   where: { AND: [auctionStatusWhere(["UPCOMING", "LIVE", "AUCTION_TODAY"])], property: { status: "PUBLISHED" } }
 * Every open row falls in exactly one of UPCOMING / AUCTION_TODAY / LIVE / COMPLETED, in the same way effectiveAuctionStatus says.
 */
export function auctionStatusWhere(statuses: readonly AuctionStatusName[], now: Date = new Date()): AuctionStatusFilter {
  const wanted = new Set(statuses);
  const clauses: AuctionStatusFilter["OR"] = [];
  const stored = statuses.filter((s) => !isOpenStatus(s)); // POSTPONED, CANCELLED, COMPLETED, EXPIRED: as stored
  if (stored.length) clauses.push({ status: { in: [...stored] } });

  const tomorrow = todayEnd(now);
  const today = istDayStart(now);
  const noStartOrLater: { OR: DateClause[] } = { OR: [{ auctionStart: null }, { auctionStart: { gte: tomorrow } }] };

  if (wanted.has("UPCOMING")) clauses.push({ AND: [{ status: { in: ["UPCOMING"] } }, notOver(now), noStartOrLater] });
  if (wanted.has("AUCTION_TODAY")) {
    clauses.push({ AND: [{ status: { in: ["AUCTION_TODAY"] } }, notOver(now), noStartOrLater] });
    clauses.push({
      AND: [
        { status: { in: ["UPCOMING", "AUCTION_TODAY"] } },
        { OR: [{ auctionEnd: null, auctionStart: { gte: today, lt: tomorrow } }, { auctionEnd: { gte: now }, auctionStart: { gt: now, lt: tomorrow } }] },
      ],
    });
  }
  if (wanted.has("LIVE")) {
    clauses.push({ AND: [{ status: { in: ["LIVE"] } }, notOver(now)] });
    clauses.push({ AND: [{ status: { in: ["UPCOMING", "AUCTION_TODAY"] } }, { auctionEnd: { gte: now } }, { auctionStart: { lte: now } }] });
  }
  if (wanted.has("COMPLETED")) clauses.push({ AND: [{ status: { in: [...OPEN_STATUSES] } }, over(now)] });
  return { OR: clauses };
}

/** Auctions that are open right now (not over). */
export const activeAuctionWhere = (now: Date = new Date()) => auctionStatusWhere(OPEN_STATUSES, now);
/** Everything that is not open right now: ended (including open-but-over), postponed, cancelled, expired. */
export const inactiveAuctionWhere = (now: Date = new Date()) => auctionStatusWhere(["COMPLETED", "POSTPONED", "CANCELLED", "EXPIRED"], now);
