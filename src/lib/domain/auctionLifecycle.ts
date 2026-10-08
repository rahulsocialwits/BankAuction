/*
 * Read-time auction lifecycle (pure, no database).
 *
 * The STORED status of an auction is written only when an import touches the listing (deriveAuctionStatusFromDates +
 * resolveAuctionStatus). Nothing updates it as time passes, so an auction that was UPCOMING when last imported stays UPCOMING
 * in the database after its date, until a source happens to be read again. A listing that has left its source (the usual case
 * for ended auctions) is never read again, so it would be shown as "upcoming" forever.
 *
 * Rather than rewriting thousands of rows, every place that SHOWS or FILTERS by status uses the functions below, which treat an
 * auction as ended as soon as its date is clearly over. They only ever move an OPEN status (UPCOMING / LIVE / AUCTION_TODAY) to
 * COMPLETED. They never touch:
 *   - POSTPONED / CANCELLED (an explicit decision, held until the date changes: see resolveAuctionStatus),
 *   - COMPLETED / EXPIRED (already ended),
 *   - an auction with no date at all (nothing says it is over),
 * and never write anything: no record is deleted, hidden or modified, and AuctionEvent history is not involved.
 * Each auction round (re-auction) is judged on its own dates, so an old round is ended while the new round stays open.
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

/** The status to show and to filter by: the stored one, except that an open auction whose date is over is COMPLETED. */
export function effectiveAuctionStatus<T extends AuctionStatusName>(
  a: { status: T; auctionStart: Date | null | undefined; auctionEnd?: Date | null },
  now: Date = new Date(),
): T | "COMPLETED" {
  if (!isOpenStatus(a.status)) return a.status;
  return isAuctionOver(a.auctionStart, a.auctionEnd, now) ? "COMPLETED" : a.status;
}

/* ---- the same rules as database filters (the filters and effectiveAuctionStatus must always agree: see the tests) ---- */

type NotOverClause = { auctionEnd: { gte: Date } } | { auctionEnd: null; auctionStart: { gte: Date } } | { auctionEnd: null; auctionStart: null };
type OverClause = { auctionEnd: { lt: Date } } | { auctionEnd: null; auctionStart: { lt: Date } };
type StatusClause = { status: { in: AuctionStatusName[] } };
type AuctionStatusFilter = { OR: Array<StatusClause | { AND: Array<StatusClause | { OR: NotOverClause[] } | { OR: OverClause[] }> }> };

const notOver = (now: Date): { OR: NotOverClause[] } => ({
  OR: [{ auctionEnd: { gte: now } }, { auctionEnd: null, auctionStart: { gte: istDayStart(now) } }, { auctionEnd: null, auctionStart: null }],
});
const over = (now: Date): { OR: OverClause[] } => ({
  OR: [{ auctionEnd: { lt: now } }, { auctionEnd: null, auctionStart: { lt: istDayStart(now) } }],
});

/**
 * Where-fragment for auctions whose EFFECTIVE status is one of `statuses`. Put it in an AND list:
 *   where: { AND: [auctionStatusWhere(["UPCOMING", "LIVE", "AUCTION_TODAY"])], property: { status: "PUBLISHED" } }
 * An open status matches only while the auction is not over; COMPLETED also matches open-but-over auctions.
 */
export function auctionStatusWhere(statuses: readonly AuctionStatusName[], now: Date = new Date()): AuctionStatusFilter {
  const wanted = new Set(statuses);
  const clauses: AuctionStatusFilter["OR"] = [];
  const stored = statuses.filter((s) => !isOpenStatus(s)); // POSTPONED, CANCELLED, COMPLETED, EXPIRED: as stored
  if (stored.length) clauses.push({ status: { in: [...stored] } });
  const open = OPEN_STATUSES.filter((s) => wanted.has(s));
  if (open.length) clauses.push({ AND: [{ status: { in: [...open] } }, notOver(now)] });
  if (wanted.has("COMPLETED")) clauses.push({ AND: [{ status: { in: [...OPEN_STATUSES] } }, over(now)] });
  return { OR: clauses };
}

/** Auctions that are open right now (not over). */
export const activeAuctionWhere = (now: Date = new Date()) => auctionStatusWhere(OPEN_STATUSES, now);
/** Everything that is not open right now: ended (including open-but-over), postponed, cancelled, expired. */
export const inactiveAuctionWhere = (now: Date = new Date()) => auctionStatusWhere(["COMPLETED", "POSTPONED", "CANCELLED", "EXPIRED"], now);
