import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPEN_STATUSES, effectiveAuctionStatus, istDayStart, type AuctionStatusName } from "../src/lib/domain/auctionLifecycle";
import { publishedWhere } from "../src/lib/queries/publishedWhere";
import { buildCitySummary, citySlug, usableGeoCity, type GeoCityGroup } from "../src/lib/domain/cityCounts";

/*
 * The homepage city card and the city results page must be the same definition. The real `publishedWhere` (the where-clause the
 * results page, the properties page and the API use) is evaluated in memory by a small stand-in for the database and compared with
 * the card count built by buildCitySummary from the same evaluated rows. Nothing here connects to a database.
 */
const now = new Date();
const H = 3_600_000;
const D = 24 * H;
const todayStart = istDayStart(now); // 00:00 IST today: a date-only auction "today"

type Round = { status: AuctionStatusName; auctionStart: Date | null; auctionEnd: Date | null; bankId?: string };
type Prop = {
  id: string;
  status: "PUBLISHED" | "DRAFT" | "REMOVED";
  geoCity: string | null;
  geoCheckedAt: Date | null;
  title: string;
  description: string;
  addressText: string | null;
  auctions: Round[];
};

const upcoming: Round = { status: "UPCOMING", auctionStart: new Date(now.getTime() + 5 * D), auctionEnd: null };
const live: Round = { status: "LIVE", auctionStart: new Date(now.getTime() - 2 * D), auctionEnd: new Date(now.getTime() + 2 * D) };
const today: Round = { status: "AUCTION_TODAY", auctionStart: todayStart, auctionEnd: null };
const storedUpcomingButStarted: Round = { status: "UPCOMING", auctionStart: new Date(now.getTime() - 2 * D), auctionEnd: new Date(now.getTime() + 2 * D) }; // effectively LIVE
const completed: Round = { status: "COMPLETED", auctionStart: new Date(now.getTime() - 30 * D), auctionEnd: null };
const staleOpen: Round = { status: "UPCOMING", auctionStart: new Date(now.getTime() - 30 * D), auctionEnd: null }; // stored open, date long over
const cancelled: Round = { status: "CANCELLED", auctionStart: new Date(now.getTime() + 5 * D), auctionEnd: null };
const postponed: Round = { status: "POSTPONED", auctionStart: new Date(now.getTime() + 5 * D), auctionEnd: null };

let n = 0;
const P = (geoCity: string | null, auctions: Round[], over: Partial<Prop> = {}): Prop => ({
  id: `p${++n}`,
  status: "PUBLISHED",
  geoCity,
  geoCheckedAt: geoCity ? new Date() : null,
  title: "Flat",
  description: "",
  addressText: null,
  auctions,
  ...over,
});

/* ---- the in-memory stand-in for the database (only the grammar publishedWhere and auctionLifecycle produce) ---- */
type DateFilter = { gt?: Date; gte?: Date; lt?: Date; lte?: Date } | null;
const cmp = (v: Date | null, f: DateFilter): boolean => {
  if (f === null) return v === null;
  if (v === null) return false;
  if (f.gt && !(v.getTime() > f.gt.getTime())) return false;
  if (f.gte && !(v.getTime() >= f.gte.getTime())) return false;
  if (f.lt && !(v.getTime() < f.lt.getTime())) return false;
  if (f.lte && !(v.getTime() <= f.lte.getTime())) return false;
  return true;
};
function evalRound(w: unknown, r: Round): boolean {
  return Object.entries(w as Record<string, unknown>).every(([k, v]) => {
    if (v === undefined) return true;
    if (k === "OR") return (v as unknown[]).some((c) => evalRound(c, r));
    if (k === "AND") return (v as unknown[]).every((c) => evalRound(c, r));
    if (k === "status") return (v as { in: string[] }).in.includes(r.status);
    if (k === "auctionStart") return cmp(r.auctionStart, v as DateFilter);
    if (k === "auctionEnd") return cmp(r.auctionEnd, v as DateFilter);
    if (k === "bankId") return r.bankId === v;
    throw new Error("unexpected round key " + k);
  });
}
const ieq = (a: string | null, b: string) => a !== null && a.toLowerCase() === b.toLowerCase();
function evalProp(w: unknown, p: Prop): boolean {
  return Object.entries(w as Record<string, unknown>).every(([k, v]) => {
    if (v === undefined) return true;
    if (k === "AND") return (v as unknown[]).every((c) => evalProp(c, p));
    if (k === "OR") return (v as unknown[]).some((c) => evalProp(c, p));
    if (k === "status") return p.status === v;
    if (k === "auctions") return p.auctions.some((r) => evalRound((v as { some: unknown }).some, r));
    if (k === "geoCity") {
      const f = v as { equals: string; mode: string };
      assert.equal(f.mode, "insensitive");
      return ieq(p.geoCity, f.equals);
    }
    throw new Error("unexpected property key " + k);
  });
}

/** What the database would hand to the card query: `groupBy geoCity` over the properties the shared where-clause matches. */
function groups(rows: Prop[], where: unknown): GeoCityGroup[] {
  const m = new Map<string | null, number>();
  for (const p of rows) if (p.geoCity !== null && evalProp(where, p)) m.set(p.geoCity, (m.get(p.geoCity) ?? 0) + 1);
  return [...m].map(([geoCity, c]) => ({ geoCity, n: c }));
}
const summarise = (rows: Prop[]) =>
  buildCitySummary(
    groups(rows, publishedWhere({ statusGroup: "active" })),
    groups(rows, { status: "PUBLISHED" }),
    rows.filter((p) => evalProp(publishedWhere({ statusGroup: "active" }), p)).length,
    ["Mumbai", "Pune"],
  );
const cardCount = (rows: Prop[], city: string) => summarise(rows).cities.find((c) => c.city === city)?.count ?? 0;
const resultsCount = (rows: Prop[], city: string) => rows.filter((p) => evalProp(publishedWhere({ city, statusGroup: "active" }), p)).length;

/* ---- the lifecycle statuses ---- */

test("Upcoming, Live and Auction Today each count as an active opportunity", () => {
  for (const [name, round] of [["upcoming", upcoming], ["live", live], ["auction today", today], ["stored upcoming but already started (effectively live)", storedUpcomingButStarted]] as const) {
    assert.equal(cardCount([P("Mumbai", [round])], "Mumbai"), 1, name);
  }
});

test("Completed, Cancelled, Postponed and stored-open-but-over auctions are not active", () => {
  for (const [name, round] of [["completed", completed], ["cancelled", cancelled], ["postponed", postponed], ["stale open", staleOpen]] as const) {
    assert.equal(cardCount([P("Mumbai", [round])], "Mumbai"), 0, name);
  }
});

test("a published property with no auction round is in the catalogue total but never active", () => {
  const rows = [P("Mumbai", []), P("Mumbai", [upcoming])];
  const mumbai = summarise(rows).cities.find((c) => c.city === "Mumbai")!;
  assert.equal(mumbai.count, 1);
  assert.equal(mumbai.total, 2, "catalogue total keeps the round-less property");
});

test("a property with several active rounds is counted once", () => {
  assert.equal(cardCount([P("Mumbai", [upcoming, live, today])], "Mumbai"), 1);
  assert.equal(cardCount([P("Mumbai", [completed, completed, upcoming])], "Mumbai"), 1, "an ended old round beside a new open round");
  assert.equal(cardCount([P("Mumbai", [completed, cancelled])], "Mumbai"), 0, "no round qualifies");
});

test("draft and removed properties are never counted", () => {
  const rows = [P("Mumbai", [upcoming], { status: "DRAFT" }), P("Mumbai", [upcoming], { status: "REMOVED" })];
  assert.equal(summarise(rows).activeTotal, 0);
  assert.equal(summarise(rows).cities.length, 0);
});

/* ---- the city definition ---- */

test("only the canonical geoCity assigns a city; a missing city is reported separately, never assigned", () => {
  const rows = [P("Mumbai", [upcoming]), P(null, [upcoming]), P(null, [live])];
  const s = summarise(rows);
  assert.equal(cardCount(rows, "Mumbai"), 1);
  assert.equal(s.activeTotal, 3);
  assert.equal(s.unassignedActive, 2, "the two city-less active properties are reported, not given to any city");
});

test("a city name in the title, description or address does not make a property belong to that city", () => {
  const stray = P(null, [upcoming], { title: "3 BHK flat in Mumbai", description: "near Mumbai airport", addressText: "Andheri, Mumbai 400069" });
  const uncheckedWithText = P(null, [upcoming], { geoCheckedAt: null, addressText: "Mumbai" });
  const otherCity = P("Pune", [upcoming], { addressText: "Mumbai-Pune expressway, Mumbai" });
  const rows = [stray, uncheckedWithText, otherCity];
  assert.equal(cardCount(rows, "Mumbai"), 0);
  assert.equal(resultsCount(rows, "Mumbai"), 0, "the results page no longer uses the text fallback either");
  assert.equal(cardCount(rows, "Pune"), 1);
  assert.equal(resultsCount(rows, "Pune"), 1);
});

test("city matching ignores letter case; a stored alias spelling is not silently assigned", () => {
  const rows = [P("mumbai", [upcoming]), P("MUMBAI", [live]), P("Bombay", [today])];
  assert.equal(cardCount(rows, "Mumbai"), 2, "case variants are one city");
  assert.equal(resultsCount(rows, "Mumbai"), 2);
  assert.equal(summarise(rows).unassignedActive, 1, "'Bombay' is not a canonical stored spelling: reported, not counted");
  assert.equal(usableGeoCity("Bombay"), null);
  assert.equal(usableGeoCity("Mumbai"), "Mumbai");
  assert.equal(usableGeoCity("x".repeat(41)), null);
  assert.equal(usableGeoCity(null), null);
});

test("Mumbai the city is its own entry (the MMR region is a different concept and is not built here)", () => {
  const rows = [P("Mumbai", [upcoming]), P("Thane", [upcoming]), P("Navi Mumbai", [upcoming])];
  assert.equal(cardCount(rows, "Mumbai"), 1);
  assert.equal(cardCount(rows, "Thane"), 1);
});

/* ---- card = results ---- */

test("CONSISTENCY: for every city, the card count equals the length of the active results list behind it", () => {
  const rows: Prop[] = [];
  const cities = ["Mumbai", "Pune", "Chennai", "Bombay", "mumbai", "Navi Mumbai"];
  const roundSets = [[], [upcoming], [live], [today], [completed], [cancelled], [postponed], [staleOpen], [upcoming, live], [completed, upcoming], [storedUpcomingButStarted]];
  for (const c of [...cities, null]) for (const rs of roundSets) for (const checked of [true, false]) for (const status of ["PUBLISHED", "DRAFT"] as const) {
    rows.push(P(c, rs, { status, geoCheckedAt: checked ? new Date() : null, addressText: "Mumbai", title: "Pune" }));
  }
  const s = summarise(rows);
  for (const city of s.cities.map((c) => c.city)) {
    assert.equal(cardCount(rows, city), resultsCount(rows, city), `card vs results for ${city}`);
  }
  // and the numbers are the expected ones, from an independent oracle (effectiveAuctionStatus), not from the where-clause
  const oracleActive = (p: Prop) => p.status === "PUBLISHED" && p.auctions.some((r) => (OPEN_STATUSES as readonly string[]).includes(effectiveAuctionStatus(r, now)));
  for (const city of ["Mumbai", "Pune", "Chennai", "Navi Mumbai"]) {
    const expected = rows.filter((p) => p.geoCity !== null && p.geoCity.toLowerCase() === city.toLowerCase() && oracleActive(p)).length;
    assert.equal(cardCount(rows, city), expected, `oracle for ${city}`);
  }
  // Every active property is either in a listed city or in the separate unassigned count.
  const oracleTotal = rows.filter(oracleActive).length;
  assert.equal(s.activeTotal, oracleTotal);
  assert.equal(s.cities.reduce((a, c) => a + c.count, 0) + s.unassignedActive, oracleTotal);
});

test("the city list keeps cities that have only ended auctions (their page must keep existing) but shows them as zero active", () => {
  const s = summarise([P("Pune", [completed]), P("Mumbai", [upcoming])]);
  const pune = s.cities.find((c) => c.city === "Pune")!;
  assert.equal(pune.count, 0);
  assert.equal(pune.total, 1);
  assert.deepEqual(s.cities.map((c) => c.city), ["Mumbai", "Pune"], "priority order, then volume");
  assert.equal(citySlug("Navi Mumbai"), "navi-mumbai");
});

/* ---- source-level guards ---- */

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

test("the card query is built from publishedWhere, the cache key moved, and nothing in the count path writes data", () => {
  const cities = read("src/lib/queries/cities.ts");
  assert.match(cities, /publishedWhere\(\{ statusGroup: "active" \}\)/);
  assert.match(cities, /\["city-summary-v2"\]/);
  assert.doesNotMatch(cities, /\["city-counts"\]/);
  assert.doesNotMatch(cities, /findMany|geoCheckedAt|city: \{ select/);
  assert.doesNotMatch(cities + read("src/lib/domain/cityCounts.ts"), /\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
  assert.doesNotMatch(read("src/lib/domain/cityCounts.ts"), /prisma/);
});

test("the results filter has no text fallback for city, and the homepage card links to the active results", () => {
  const lp = read("src/lib/queries/publishedWhere.ts");
  assert.match(lp, /if \(filters\.city\) and\.push\(\{ geoCity: \{ equals: canonCity\(filters\.city\), mode: "insensitive" \} \}\)/);
  const home = read("src/app/(site)/page.tsx");
  assert.match(home, /status=active/);
  assert.match(home, /active propert/);
  assert.match(read("src/app/(site)/city/[slug]/page.tsx"), /statusGroup: "active"/);
});
