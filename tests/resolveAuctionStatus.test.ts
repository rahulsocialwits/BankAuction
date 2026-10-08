import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auctionDateChanged, detectExplicitStatus, isHeldStatus, resolveAuctionStatus } from "../src/lib/domain/resolveAuctionStatus";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("explicit signal wins over the dates", () => {
  assert.equal(resolveAuctionStatus({ current: "UPCOMING", derived: "UPCOMING", explicit: "POSTPONED" }), "POSTPONED");
  assert.equal(resolveAuctionStatus({ current: "UPCOMING", derived: "COMPLETED", explicit: "CANCELLED" }), "CANCELLED");
});

test("REGRESSION: a re-import must not reset POSTPONED / CANCELLED back to UPCOMING while the date is unchanged", () => {
  assert.equal(resolveAuctionStatus({ current: "POSTPONED", derived: "UPCOMING", dateChanged: false }), "POSTPONED");
  assert.equal(resolveAuctionStatus({ current: "CANCELLED", derived: "UPCOMING", dateChanged: false }), "CANCELLED");
  assert.equal(resolveAuctionStatus({ current: "CANCELLED", derived: "COMPLETED" }), "CANCELLED", "a cancelled auction whose date passed is not 'completed'");
});

test("a changed auction date means rescheduled: the date-derived status applies again", () => {
  assert.equal(resolveAuctionStatus({ current: "POSTPONED", derived: "UPCOMING", dateChanged: true }), "UPCOMING");
  assert.equal(resolveAuctionStatus({ current: "CANCELLED", derived: "UPCOMING", dateChanged: true }), "UPCOMING");
});

test("normal date lifecycle is unchanged for every other status", () => {
  for (const current of ["UPCOMING", "AUCTION_TODAY", "LIVE", "COMPLETED"] as const) {
    assert.equal(resolveAuctionStatus({ current, derived: "COMPLETED" }), "COMPLETED");
    assert.equal(resolveAuctionStatus({ current, derived: "UPCOMING" }), "UPCOMING");
  }
  assert.equal(resolveAuctionStatus({ current: null, derived: "UPCOMING" }), "UPCOMING");
});

test("auctionDateChanged: only a supplied, different date counts", () => {
  const d1 = new Date("2026-11-01T10:00:00Z");
  assert.equal(auctionDateChanged(d1, new Date(d1.getTime())), false);
  assert.equal(auctionDateChanged(d1, new Date("2026-11-20T10:00:00Z")), true);
  assert.equal(auctionDateChanged(d1, null), false, "a missing date on re-read is not a reschedule");
  assert.equal(auctionDateChanged(null, d1), true);
});

test("detectExplicitStatus reads deliberate status values only", () => {
  assert.equal(detectExplicitStatus("Postponed"), "POSTPONED");
  assert.equal(detectExplicitStatus("AUCTION POSTPONED"), "POSTPONED");
  assert.equal(detectExplicitStatus("adjourned"), "POSTPONED");
  assert.equal(detectExplicitStatus("Cancelled"), "CANCELLED");
  assert.equal(detectExplicitStatus("canceled"), "CANCELLED");
  assert.equal(detectExplicitStatus("Withdrawn by bank"), "CANCELLED");
  for (const v of ["Upcoming", "Live", "Open", "", "   ", null, undefined]) assert.equal(detectExplicitStatus(v), null, String(v));
});

test("FALSE-POSITIVE GUARD: long descriptive text (boilerplate mentioning cancellation) is never read as a status", () => {
  const boiler = "The EMD will be refunded to unsuccessful bidders and the auction may be cancelled or postponed at the sole discretion of the authorised officer without assigning any reason.";
  assert.equal(detectExplicitStatus(boiler), null);
});

test("isHeldStatus", () => {
  assert.equal(isHeldStatus("POSTPONED"), true);
  assert.equal(isHeldStatus("CANCELLED"), true);
  assert.equal(isHeldStatus("UPCOMING"), false);
  assert.equal(isHeldStatus(null), false);
});

test("WIRING: every automatic re-derivation site goes through resolveAuctionStatus", () => {
  const adapter = read("src/data-sources/bankauctions/adapter.ts");
  assert.match(adapter, /resolveAuctionStatus\(/);
  assert.match(adapter, /status: resolvedStatus/);
  assert.doesNotMatch(adapter.slice(adapter.indexOf("if (existingAuction)"), adapter.indexOf("const existingProperty")), /status: derivedStatus/, "update path must not write the raw date-derived status");
  const csv = read("src/lib/import/csvImport.ts");
  assert.match(csv, /resolveAuctionStatus\(/);
  assert.doesNotMatch(csv, /data: \{ status: deriveAuctionStatusFromDates\(prev/, "superseded round must not be re-derived blindly");
  assert.match(csv, /status: true, auctionStart: true/, "rounds query must read the current status");
});

test("WIRING: status changes are written to AuctionEvent and never throw", () => {
  const ev = read("src/lib/pipeline/auctionEvents.ts");
  assert.match(ev, /auctionEvent\.create/);
  assert.match(ev, /catch/);
  for (const f of ["src/data-sources/bankauctions/adapter.ts", "src/lib/import/csvImport.ts", "src/app/admin/(shell)/properties/actions.ts"]) {
    assert.match(read(f), /recordAuctionStatusChange\(/, f);
  }
});

test("WIRING: admin can set Postponed / Cancelled and the form offers it", () => {
  assert.match(read("src/app/admin/(shell)/properties/actions.ts"), /choice === "POSTPONED" \|\| choice === "CANCELLED"/);
  const page = read("src/app/admin/(shell)/properties/[id]/edit/page.tsx");
  assert.match(page, /name="auctionStatus"/);
  assert.match(page, /value="POSTPONED"/);
  assert.match(page, /value="CANCELLED"/);
});

test("the pure resolver has no database or Prisma runtime import", () => {
  assert.doesNotMatch(read("src/lib/domain/resolveAuctionStatus.ts"), /import (?!type)[^;]*(prisma|@prisma\/client)/);
});

/* ---------- Phase 3 PR 9: source lifecycle status mapping ---------- */

import { ExplicitAuctionStatus } from "../src/lib/domain/resolveAuctionStatus";

const labels = JSON.parse(read("tests/fixtures/source-status-labels.json")) as Record<string, { raw: string; expected: ExplicitAuctionStatus | null }[] | string>;

for (const [source, rows] of Object.entries(labels)) {
  if (!Array.isArray(rows)) continue;
  test(`status labels (${source}): each wording maps to the safe status or to nothing`, () => {
    for (const r of rows) assert.equal(detectExplicitStatus(r.raw), r.expected, JSON.stringify(r.raw));
  });
}

test("mapping uses only statuses the domain already has: nothing is invented", () => {
  const schema = read("prisma/schema.prisma");
  const body = /enum AuctionStatus \{([^}]*)\}/.exec(schema)![1].split(/\s+/).filter(Boolean);
  assert.deepEqual(body.sort(), ["AUCTION_TODAY", "CANCELLED", "COMPLETED", "EXPIRED", "LIVE", "POSTPONED", "UPCOMING"]);
  const all = new Set(Object.values(labels).flatMap((r) => (Array.isArray(r) ? r.map((x) => x.expected) : [])).filter(Boolean));
  for (const s of all) assert.ok(body.includes(s as string), String(s));
});

test("an explicit COMPLETED (sold / completed) is applied, and wins over a future-dated derivation", () => {
  assert.equal(resolveAuctionStatus({ current: "UPCOMING", derived: "UPCOMING", explicit: "COMPLETED" }), "COMPLETED");
  assert.equal(resolveAuctionStatus({ current: "POSTPONED", derived: "UPCOMING", explicit: "COMPLETED" }), "COMPLETED");
});

test("COMPLETED is not sticky: without the signal the normal date lifecycle applies (only POSTPONED / CANCELLED are held)", () => {
  assert.equal(isHeldStatus("COMPLETED"), false);
  assert.equal(resolveAuctionStatus({ current: "COMPLETED", derived: "UPCOMING", dateChanged: false }), "UPCOMING");
});

test("sticky POSTPONED / CANCELLED are unchanged by the new mapping", () => {
  assert.equal(resolveAuctionStatus({ current: "POSTPONED", derived: "UPCOMING", dateChanged: false }), "POSTPONED");
  assert.equal(resolveAuctionStatus({ current: "CANCELLED", derived: "UPCOMING", dateChanged: false }), "CANCELLED");
  assert.equal(resolveAuctionStatus({ current: "CANCELLED", derived: "UPCOMING", dateChanged: true }), "UPCOMING");
});

test("a new listing that arrives with an explicit status is created with it (all three creation sites)", () => {
  const csv = read("src/lib/import/csvImport.ts");
  const sites = csv.match(/explicit: detectExplicitStatus\(rec\.auction_status\)/g) ?? [];
  assert.ok(sites.length >= 4, `update path + 3 creation sites, found ${sites.length}`);
  assert.doesNotMatch(csv, /status: deriveAuctionStatusFromDates\(start, x\.auctionEnd\),/, "new round must honour an explicit status");
});

test("DISAPPEARANCE FLAGS NEVER BECOME A STATUS: last-seen code cannot write or resolve an auction status", () => {
  for (const f of ["src/lib/pipeline/lastSeen.ts", "src/lib/pipeline/lastSeenStore.ts"]) {
    const s = read(f);
    assert.doesNotMatch(s, /CANCELLED|POSTPONED|resolveAuctionStatus|recordAuctionStatusChange|auction\.update|property\.update/, f);
  }
  // and the other direction: the status code knows nothing about flags
  assert.doesNotMatch(read("src/lib/domain/resolveAuctionStatus.ts"), /disappear|missing:|lastSeen/i);
});

test("source-specific: BAANKNET's list filter (upcoming / live) is never read as a status, and its records carry no auction_status", () => {
  assert.doesNotMatch(read("src/data-sources/feeds/renderedParser.ts"), /auction_status/);
  assert.doesNotMatch(read("src/data-sources/feeds/baanknetImport.ts"), /auction_status|detectExplicitStatus/);
});

test("source-specific: BankAuctions.in passes no explicit status (no verified status field; free text is never scanned)", () => {
  const adapter = read("src/data-sources/bankauctions/adapter.ts");
  const call = adapter.slice(adapter.indexOf("resolveAuctionStatus({"), adapter.indexOf("resolveAuctionStatus({") + 260);
  assert.doesNotMatch(call, /explicit/);
});
