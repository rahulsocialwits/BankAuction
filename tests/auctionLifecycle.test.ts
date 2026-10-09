import test from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_STATUSES,
  activeAuctionWhere,
  auctionStatusWhere,
  effectiveAuctionStatus,
  inactiveAuctionWhere,
  isAuctionOver,
  istDayStart,
  type AuctionStatusName,
} from "../src/lib/domain/auctionLifecycle";
import { auctionDateChanged, resolveAuctionStatus } from "../src/lib/domain/resolveAuctionStatus";

const now = new Date("2026-10-08T12:00:00Z"); // 17:30 IST on 8 Oct
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(now.getTime() - ms);
const ahead = (ms: number) => new Date(now.getTime() + ms);
const a = (status: AuctionStatusName, auctionStart: Date | null, auctionEnd: Date | null = null) => ({ status, auctionStart, auctionEnd });

/* ---- istDayStart / isAuctionOver ---- */

test("istDayStart is midnight in India", () => {
  assert.equal(istDayStart(new Date("2026-10-08T12:00:00Z")).toISOString(), "2026-10-07T18:30:00.000Z");
  assert.equal(istDayStart(new Date("2026-10-07T18:29:59Z")).toISOString(), "2026-10-06T18:30:00.000Z");
  assert.equal(istDayStart(new Date("2026-10-07T18:30:00Z")).toISOString(), "2026-10-07T18:30:00.000Z");
});

test("an auction is not over on the day it takes place, even hours after its start time", () => {
  assert.equal(isAuctionOver(ago(6 * H), null, now), false); // started 11:30 IST today
  assert.equal(isAuctionOver(new Date("2026-10-08T05:30:00Z"), null, now), false); // 00:00 IST today (date-only source)
});

test("an auction with no end is over once its Indian calendar day has ended", () => {
  assert.equal(isAuctionOver(new Date("2026-10-07T10:00:00Z"), null, now), true); // yesterday
  assert.equal(isAuctionOver(new Date("2026-10-07T18:00:00Z"), null, new Date("2026-10-07T18:29:00Z")), false); // 23:30 IST, day not over yet
  assert.equal(isAuctionOver(new Date("2026-10-07T18:00:00Z"), null, new Date("2026-10-07T18:31:00Z")), true);
});

test("auctionEnd decides when it exists", () => {
  assert.equal(isAuctionOver(ago(3 * D), ahead(H), now), false);
  assert.equal(isAuctionOver(ahead(D), ago(H), now), true);
});

test("an auction with no dates is never over", () => {
  assert.equal(isAuctionOver(null, null, now), false);
  assert.equal(isAuctionOver(undefined, undefined, now), false);
});

/* ---- effectiveAuctionStatus ---- */

test("NORMAL ENDED: a stored UPCOMING / LIVE / AUCTION_TODAY auction whose date is over is shown as COMPLETED", () => {
  for (const s of OPEN_STATUSES) assert.equal(effectiveAuctionStatus(a(s, ago(5 * D)), now), "COMPLETED", s);
});

test("a future auction keeps its stored status", () => {
  assert.equal(effectiveAuctionStatus(a("UPCOMING", ahead(5 * D)), now), "UPCOMING");
  assert.equal(effectiveAuctionStatus(a("AUCTION_TODAY", ago(2 * H)), now), "AUCTION_TODAY");
});

test("POSTPONED stays POSTPONED even though its old date has passed (a new date is awaited)", () => {
  assert.equal(effectiveAuctionStatus(a("POSTPONED", ago(30 * D)), now), "POSTPONED");
  assert.equal(effectiveAuctionStatus(a("POSTPONED", ago(30 * D), ago(29 * D)), now), "POSTPONED");
});

test("CANCELLED stays CANCELLED, never turned into COMPLETED", () => {
  assert.equal(effectiveAuctionStatus(a("CANCELLED", ago(30 * D)), now), "CANCELLED");
  assert.equal(effectiveAuctionStatus(a("CANCELLED", ahead(30 * D)), now), "CANCELLED");
});

test("COMPLETED and EXPIRED are left alone, including when their date is in the future (never reopened)", () => {
  assert.equal(effectiveAuctionStatus(a("COMPLETED", ahead(5 * D)), now), "COMPLETED");
  assert.equal(effectiveAuctionStatus(a("EXPIRED", ahead(5 * D)), now), "EXPIRED");
});

test("an open auction with no date is not declared ended", () => {
  assert.equal(effectiveAuctionStatus(a("UPCOMING", null), now), "UPCOMING");
});

test("a postponed auction that is re-scheduled (date changed) follows the normal lifecycle again, through resolveAuctionStatus", () => {
  // the date change is handled at write time by the existing rule; the read-time layer then judges the new open status on the new date
  const newDate = ahead(10 * D);
  const stored = resolveAuctionStatus({ current: "POSTPONED", derived: "UPCOMING", dateChanged: auctionDateChanged(ago(30 * D), newDate) });
  assert.equal(stored, "UPCOMING");
  assert.equal(effectiveAuctionStatus(a(stored, newDate), now), "UPCOMING");
});

test("RE-AUCTION: the old round is ended and the new round is open, each judged on its own dates", () => {
  const oldRound = a("UPCOMING", ago(40 * D)); // never refreshed after the first sale date passed
  const newRound = a("UPCOMING", ahead(12 * D));
  assert.equal(effectiveAuctionStatus(oldRound, now), "COMPLETED");
  assert.equal(effectiveAuctionStatus(newRound, now), "UPCOMING");
  const rounds = [oldRound, newRound];
  assert.equal(rounds.filter((r) => effectiveAuctionStatus(r, now) === "UPCOMING").length, 1, "the property is still open through its new round");
});

test("it never writes or mutates: the input object is unchanged", () => {
  const input = Object.freeze(a("UPCOMING", ago(5 * D)));
  assert.equal(effectiveAuctionStatus(input, now), "COMPLETED");
  assert.equal(input.status, "UPCOMING");
});

/* ---- C1: a stored UPCOMING / AUCTION_TODAY auction moves forward once its start has come (read time, nothing written) ---- */

test("C1 REGRESSION: stored UPCOMING, start passed, end still ahead (a bidding window) shows as LIVE", () => {
  // the two production listings: start 7 Oct / 8 Oct, end 16 Oct / 14 Oct, still stored as UPCOMING on 9 Oct
  const nineOct = new Date("2026-10-09T08:00:00Z"); // 13:30 IST on 9 Oct
  const nellore = a("UPCOMING", new Date("2026-10-07T05:30:00Z"), new Date("2026-10-16T07:30:00Z"));
  const cherthala = a("UPCOMING", new Date("2026-10-08T06:00:00Z"), new Date("2026-10-14T07:30:00Z"));
  assert.equal(effectiveAuctionStatus(nellore, nineOct), "LIVE");
  assert.equal(effectiveAuctionStatus(cherthala, nineOct), "LIVE");
  // ...and they are in the Live results, not in the Upcoming results
  for (const r of [nellore, cherthala]) {
    assert.equal(evalWhere(auctionStatusWhere(["LIVE"], nineOct), r), true);
    assert.equal(evalWhere(auctionStatusWhere(["UPCOMING"], nineOct), r), false);
  }
});

test("C1: the same auction before its start is still UPCOMING, and after its end is COMPLETED", () => {
  const start = new Date("2026-10-07T05:30:00Z");
  const end = new Date("2026-10-16T07:30:00Z");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", start, end), new Date("2026-10-05T08:00:00Z")), "UPCOMING");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", start, end), new Date("2026-10-07T05:29:00Z")), "AUCTION_TODAY", "later the same IST day");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", start, end), new Date("2026-10-07T05:30:00Z")), "LIVE", "at the start instant");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", start, end), new Date("2026-10-16T07:31:00Z")), "COMPLETED");
});

test("C1: single-day auctions follow the Auction Today rule (no end: today's auction, before or after its start time)", () => {
  assert.equal(effectiveAuctionStatus(a("UPCOMING", ago(2 * H)), now), "AUCTION_TODAY", "started 15:30 IST, day not over");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", ahead(2 * H)), now), "AUCTION_TODAY", "later today");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", new Date("2026-10-08T05:30:00Z")), now), "AUCTION_TODAY", "date-only source, 00:00 IST");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", ahead(D)), now), "UPCOMING", "tomorrow stays upcoming");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", ahead(D + 7 * H), ahead(3 * D)), now), "UPCOMING", "starts tomorrow, ends later");
});

test("C1: a stored AUCTION_TODAY auction whose window has begun is LIVE; a stored LIVE one stays LIVE until over; nothing moves backward", () => {
  assert.equal(effectiveAuctionStatus(a("AUCTION_TODAY", ago(2 * D), ahead(2 * D)), now), "LIVE");
  assert.equal(effectiveAuctionStatus(a("LIVE", ago(2 * H)), now), "LIVE");
  assert.equal(effectiveAuctionStatus(a("LIVE", ahead(5 * D)), now), "LIVE", "a stored LIVE is never downgraded");
  assert.equal(effectiveAuctionStatus(a("LIVE", ago(2 * D), ago(H)), now), "COMPLETED");
});

test("C1: missing or ambiguous dates are never guessed", () => {
  assert.equal(effectiveAuctionStatus(a("UPCOMING", null, null), now), "UPCOMING");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", null, ahead(2 * D)), now), "UPCOMING", "an end alone does not say when it started");
  assert.equal(effectiveAuctionStatus(a("UPCOMING", null, ago(H)), now), "COMPLETED", "existing rule: a past end is over");
  assert.equal(effectiveAuctionStatus(a("AUCTION_TODAY", null, null), now), "AUCTION_TODAY");
});

test("C1: POSTPONED, CANCELLED, COMPLETED and EXPIRED are never moved forward, whatever their dates", () => {
  for (const s of ["POSTPONED", "CANCELLED", "COMPLETED", "EXPIRED"] as const) {
    for (const [st, en] of [[ago(2 * D), ahead(2 * D)], [ago(2 * H), null], [ahead(2 * H), null], [ahead(5 * D), null]] as const) {
      assert.equal(effectiveAuctionStatus(a(s, st, en), now), s, s);
    }
  }
});

test("C1: each re-auction round is judged on its own dates", () => {
  const old = a("UPCOMING", ago(60 * D), ago(59 * D));
  const current = a("UPCOMING", ago(2 * D), ahead(3 * D));
  const next = a("UPCOMING", ahead(30 * D), ahead(31 * D));
  assert.deepEqual([old, current, next].map((r) => effectiveAuctionStatus(r, now)), ["COMPLETED", "LIVE", "UPCOMING"]);
});

test("C1: every open row is in exactly one of UPCOMING / AUCTION_TODAY / LIVE / COMPLETED, and the active set is their union", () => {
  const four = ["UPCOMING", "AUCTION_TODAY", "LIVE", "COMPLETED"] as const;
  for (const r of rows.filter((x) => (OPEN_STATUSES as readonly string[]).includes(x.status))) {
    const hits = four.filter((w) => evalWhere(auctionStatusWhere([w], now), r));
    assert.equal(hits.length, 1, `${r.status} ${r.auctionStart?.toISOString()} ${r.auctionEnd?.toISOString()} -> ${hits.join(",")}`);
    assert.equal(hits[0], effectiveAuctionStatus(r, now));
  }
});

test("C1: the filters are evaluated at the start boundary and the IST midnight boundary the same way as the display", () => {
  const edge: (Date | null)[] = [now, new Date(now.getTime() - 1), new Date(now.getTime() + 1), new Date("2026-10-08T18:29:59.999Z"), new Date("2026-10-08T18:30:00Z"), new Date("2026-10-07T18:30:00Z"), new Date("2026-10-07T18:29:59.999Z")];
  for (const status of ["UPCOMING", "AUCTION_TODAY", "LIVE"] as const) for (const st of edge) for (const en of [null, ...edge]) {
    const r: Row = { status, auctionStart: st, auctionEnd: en };
    for (const w of ["UPCOMING", "AUCTION_TODAY", "LIVE", "COMPLETED"] as const) {
      assert.equal(evalWhere(auctionStatusWhere([w], now), r), effectiveAuctionStatus(r, now) === w, `${w} ${status} ${st?.toISOString()} ${en?.toISOString()}`);
    }
  }
});

/* ---- the database filters must agree with effectiveAuctionStatus ---- */

type Row = { status: AuctionStatusName; auctionStart: Date | null; auctionEnd: Date | null };
const cmp = (v: Date | null, f: { gt?: Date; gte?: Date; lt?: Date; lte?: Date } | null): boolean => {
  if (f === null) return v === null;
  if (v === null) return false;
  if (f.gt && !(v.getTime() > f.gt.getTime())) return false;
  if (f.gte && !(v.getTime() >= f.gte.getTime())) return false;
  if (f.lt && !(v.getTime() < f.lt.getTime())) return false;
  if (f.lte && !(v.getTime() <= f.lte.getTime())) return false;
  return true;
};
/** A tiny evaluator for exactly the filter grammar auctionLifecycle.ts produces (a stand-in for the database). */
function evalWhere(w: unknown, r: Row): boolean {
  const o = w as Record<string, unknown>;
  return Object.entries(o).every(([k, v]) => {
    if (k === "OR") return (v as unknown[]).some((c) => evalWhere(c, r));
    if (k === "AND") return (v as unknown[]).every((c) => evalWhere(c, r));
    if (k === "status") return ((v as { in: string[] }).in).includes(r.status);
    if (k === "auctionStart") return cmp(r.auctionStart, v as never);
    if (k === "auctionEnd") return cmp(r.auctionEnd, v as never);
    throw new Error("unexpected key " + k);
  });
}

const ALL: AuctionStatusName[] = ["UPCOMING", "LIVE", "AUCTION_TODAY", "COMPLETED", "POSTPONED", "CANCELLED", "EXPIRED"];
const dates: (Date | null)[] = [null, ago(40 * D), ago(2 * D), ago(7 * H), ago(H), ahead(H), ahead(2 * D), new Date("2026-10-07T18:29:00Z"), new Date("2026-10-07T18:31:00Z"), new Date("2026-10-08T05:30:00Z")];
const rows: Row[] = ALL.flatMap((status) => dates.flatMap((auctionStart) => dates.map((auctionEnd) => ({ status, auctionStart, auctionEnd }))));

test("FILTER = DISPLAY: for every status, start and end combination, the database filter and effectiveAuctionStatus agree", () => {
  for (const wanted of ALL) {
    const filter = auctionStatusWhere([wanted], now);
    for (const r of rows) {
      const expected = effectiveAuctionStatus(r, now) === wanted;
      assert.equal(evalWhere(filter, r), expected, `${wanted} vs ${r.status} ${r.auctionStart?.toISOString()} ${r.auctionEnd?.toISOString()}`);
    }
  }
});

test("activeAuctionWhere matches exactly the open, not-over auctions; inactiveAuctionWhere is its exact complement", () => {
  const active = activeAuctionWhere(now);
  const inactive = inactiveAuctionWhere(now);
  for (const r of rows) {
    const eff = effectiveAuctionStatus(r, now);
    const isActive = (OPEN_STATUSES as readonly string[]).includes(eff);
    assert.equal(evalWhere(active, r), isActive);
    assert.equal(evalWhere(inactive, r), !isActive, "complement");
  }
});

test("a postponed or cancelled auction is never in the active set and never in COMPLETED", () => {
  const completed = auctionStatusWhere(["COMPLETED"], now);
  for (const status of ["POSTPONED", "CANCELLED"] as const) for (const d of dates) {
    const r: Row = { status, auctionStart: d, auctionEnd: null };
    assert.equal(evalWhere(activeAuctionWhere(now), r), false);
    assert.equal(evalWhere(completed, r), false);
  }
});

test("asking for no status matches nothing", () => {
  assert.deepEqual(auctionStatusWhere([], now), { OR: [] });
});

test("the filters only read: they contain no write operations (a plain data structure)", () => {
  assert.doesNotMatch(JSON.stringify(activeAuctionWhere(now)), /delete|update|create/i);
});

/* ---- source-level guards ---- */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("the lifecycle module is pure: it imports no database client and contains no write calls", () => {
  const src = read("src/lib/domain/auctionLifecycle.ts");
  assert.doesNotMatch(src, /prisma|@prisma\/client/);
  assert.doesNotMatch(src, /\.(create|update|delete|upsert|deleteMany|updateMany)\(/);
});

test("REGRESSION: no visitor-facing query filters by the raw stored open status any more", () => {
  const files = [
    "src/lib/queries/listAuctions.ts",
    "src/lib/queries/listProperties.ts",
    "src/lib/queries/autoMeta.ts",
    "src/app/(site)/page.tsx",
    "src/app/admin/(shell)/page.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /status: \{ in: \["UPCOMING"/, f);
    assert.doesNotMatch(src, /ACTIVE_STATUSES/, f);
    assert.doesNotMatch(src, /status: "UPCOMING", property/, f);
    assert.doesNotMatch(src, /status: "COMPLETED", property/, f);
  }
  assert.match(read("src/lib/queries/listAuctions.ts"), /auctionStatusWhere\(statuses\)/);
  assert.match(read("src/lib/queries/listProperties.ts"), /activeAuctionWhere\(\)/);
  assert.match(read("src/lib/queries/listProperties.ts"), /inactiveAuctionWhere\(\)/);
});

test("the status shown on cards, the property page and the public API goes through effectiveAuctionStatus", () => {
  assert.match(read("src/lib/queries/listAuctions.ts"), /effectiveAuctionStatus\(a\)/);
  assert.match(read("src/lib/queries/listProperties.ts"), /effectiveAuctionStatus\(auction\)/);
  assert.match(read("src/lib/apiShape.ts"), /effectiveAuctionStatus\(a\)/);
  const page = read("src/app/(site)/property/[slug]/page.tsx");
  assert.match(page, /effectiveAuctionStatus\(auction\)/);
  assert.match(page, /effectiveAuctionStatus\(r\)/);
});

test("the stored-status writers are unchanged: this fix writes nothing (no status write was added anywhere under src/lib/queries or the lifecycle module)", () => {
  const dir = join(root, "src/lib/queries");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && statSync(join(dir, n)).isFile())) {
    assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), /\.(update|updateMany|delete|deleteMany|upsert)\(/, f);
  }
});
