import test from "node:test";
import assert from "node:assert/strict";
import { STALE_GRACE_MS, classifyAuction, overlapOf, pct, sourceKeyOf, summarizeCoverage, type CoverageAuctionRow } from "../src/lib/pipeline/coverage";

const now = new Date("2026-10-08T12:00:00Z");
const day = 864e5;
const row = (o: Partial<CoverageAuctionRow> = {}): CoverageAuctionRow => ({
  externalId: "src:example-bank.in:1",
  sourceUrl: "https://example-bank.in/a/1",
  auctionStatus: "UPCOMING",
  auctionStart: new Date(now.getTime() + 5 * day),
  auctionEnd: null,
  reservePrice: 4_500_000,
  propertyStatus: "PUBLISHED",
  hasAddress: true,
  ...o,
});

test("a published upcoming auction with price, date and address is current and actionable", () => {
  const c = classifyAuction(row(), now);
  assert.deepEqual(c, { duplicate: false, removed: false, unique: true, published: true, current: true, stale: false, actionable: true });
});

test("actionable needs reserve price, auction date AND an address", () => {
  assert.equal(classifyAuction(row({ reservePrice: null }), now).actionable, false);
  assert.equal(classifyAuction(row({ reservePrice: 0 }), now).actionable, false);
  assert.equal(classifyAuction(row({ auctionStart: null }), now).actionable, false);
  assert.equal(classifyAuction(row({ hasAddress: false }), now).actionable, false);
  assert.equal(classifyAuction(row({ reservePrice: null }), now).current, true, "still current, just not actionable");
});

test("duplicates and removed listings are never unique, published, current or actionable", () => {
  for (const s of ["DUPLICATE", "REMOVED"]) {
    const c = classifyAuction(row({ propertyStatus: s }), now);
    assert.equal(c.unique, false);
    assert.equal(c.published, false);
    assert.equal(c.current, false);
    assert.equal(c.actionable, false);
  }
  assert.equal(classifyAuction(row({ propertyStatus: "DUPLICATE" }), now).duplicate, true);
  assert.equal(classifyAuction(row({ propertyStatus: "REMOVED" }), now).removed, true);
});

test("unpublished (pending review / draft) listings are unique but not published", () => {
  const c = classifyAuction(row({ propertyStatus: "PENDING_REVIEW" }), now);
  assert.equal(c.unique, true);
  assert.equal(c.published, false);
  assert.equal(c.current, false);
});

test("an open auction whose date passed more than the grace period ago is stale, not current", () => {
  const c = classifyAuction(row({ auctionStart: new Date(now.getTime() - STALE_GRACE_MS - 60_000) }), now);
  assert.equal(c.stale, true);
  assert.equal(c.current, false);
  assert.equal(c.actionable, false);
});

test("an auction that ended a few hours ago is still inside the grace period", () => {
  const c = classifyAuction(row({ auctionStart: new Date(now.getTime() - 3 * 3_600_000) }), now);
  assert.equal(c.current, true);
  assert.equal(c.stale, false);
});

test("auctionEnd, when present, decides whether the auction is over", () => {
  const c = classifyAuction(row({ auctionStart: new Date(now.getTime() - 2 * day), auctionEnd: new Date(now.getTime() + day) }), now);
  assert.equal(c.current, true);
});

test("completed, cancelled and expired auctions are not current and not stale", () => {
  for (const s of ["COMPLETED", "CANCELLED", "EXPIRED"]) {
    const c = classifyAuction(row({ auctionStatus: s, auctionStart: new Date(now.getTime() - 40 * day) }), now);
    assert.equal(c.current, false, s);
    assert.equal(c.stale, false, s);
  }
});

test("a POSTPONED auction stays current even though its old date has passed (a new date is awaited)", () => {
  const c = classifyAuction(row({ auctionStatus: "POSTPONED", auctionStart: new Date(now.getTime() - 10 * day) }), now);
  assert.equal(c.current, true);
  assert.equal(c.stale, false);
});

test("sourceKeyOf prefers the source-qualified id, then the URL host, then unknown", () => {
  assert.equal(sourceKeyOf({ externalId: "src:BAANKNET.com:123", sourceUrl: "https://other.example/x" }), "baanknet.com");
  assert.equal(sourceKeyOf({ externalId: "ABC-1", sourceUrl: "https://www.BankAuctions.in/auction/x" }), "bankauctions.in");
  assert.equal(sourceKeyOf({ externalId: null, sourceUrl: "not a url" }), "(manual / unknown)");
  assert.equal(sourceKeyOf({ externalId: null, sourceUrl: null }), "(manual / unknown)");
});

test("summarizeCoverage totals and per-source counts add up, ordered by actionable auctions", () => {
  const rows = [
    row({ externalId: "src:a.in:1" }),
    row({ externalId: "src:a.in:2" }),
    row({ externalId: "src:a.in:3", propertyStatus: "DUPLICATE" }),
    row({ externalId: "src:b.in:1" }),
    row({ externalId: "src:b.in:2", reservePrice: null }),
    row({ externalId: "src:b.in:3", auctionStatus: "COMPLETED", auctionStart: new Date(now.getTime() - 30 * day) }),
    row({ externalId: null, sourceUrl: null }),
  ];
  const s = summarizeCoverage(rows, now);
  assert.equal(s.overall.total, 7);
  assert.equal(s.overall.duplicate, 1);
  assert.equal(s.overall.unique, 6);
  assert.equal(s.overall.actionable, 4);
  assert.deepEqual(s.bySource.map((x) => x.source), ["a.in", "b.in", "(manual / unknown)"]);
  assert.equal(s.bySource[0].counts.actionable, 2);
  assert.equal(s.bySource.reduce((n, x) => n + x.counts.total, 0), s.overall.total);
  assert.equal(s.bySource.reduce((n, x) => n + x.counts.actionable, 0), s.overall.actionable);
  assert.ok(Math.abs(s.bySource.reduce((n, x) => n + x.shareOfActionable, 0) - 1) < 1e-9);
});

test("summarizeCoverage on no rows is all zeros with no division by zero", () => {
  const s = summarizeCoverage([], now);
  assert.equal(s.overall.total, 0);
  assert.deepEqual(s.bySource, []);
});

test("the brief's example: 4,000 valid listings of which 3,500 are already held contribute 500 and overlap 87.5%", () => {
  const o = overlapOf([{ created: 500, duplicates: 3500, rejected: 0 }]);
  assert.equal(o.valid, 4000);
  assert.equal(o.created, 500);
  assert.equal(o.overlapRatio, 0.875);
  assert.equal(o.uniqueRatio, 0.125);
  assert.equal(pct(o.overlapRatio, 1), "87.5%");
});

test("overlap adds runs together, counts rejected separately, and is not measurable without valid records", () => {
  const o = overlapOf([{ created: 9, duplicates: 1132, rejected: 57 }, { created: 1, duplicates: 10, rejected: 0 }]);
  assert.equal(o.created, 10);
  assert.equal(o.duplicates, 1142);
  assert.equal(o.discovered, 1209);
  assert.ok(o.overlapRatio! > 0.99);
  const none = overlapOf([{ created: 0, duplicates: 0, rejected: 5 }]);
  assert.equal(none.overlapRatio, null);
  assert.equal(none.uniqueRatio, null);
  assert.equal(pct(none.overlapRatio), "—");
});

test("overlap ignores negative or missing counters instead of producing nonsense", () => {
  const o = overlapOf([{ created: -3, duplicates: 4, rejected: Number.NaN }]);
  assert.equal(o.created, 0);
  assert.equal(o.duplicates, 4);
  assert.equal(o.rejected, 0);
});
