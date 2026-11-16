/**
 * P1.5 — 7-day expired listing lifecycle (file-read tests, no Prisma needed)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expireLib = readFileSync(resolve("src/lib/pipeline/expireAuctions.ts"), "utf8");
const expireRoute = readFileSync(resolve("src/app/api/cron/expire/route.ts"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/expire.yml"), "utf8");

describe("P1.5 — expired listing lifecycle", () => {
  it("grace period constant is 7 days", () => {
    assert.ok(expireLib.includes("EXPIRY_GRACE_DAYS = 7"), "EXPIRY_GRACE_DAYS must be 7");
  });

  it("expireStaleAuctions only targets UPCOMING / LIVE / AUCTION_TODAY", () => {
    assert.ok(expireLib.includes("UPCOMING"), "must include UPCOMING in target statuses");
    assert.ok(expireLib.includes("LIVE"), "must include LIVE");
    assert.ok(expireLib.includes("AUCTION_TODAY"), "must include AUCTION_TODAY");
  });

  it("expireStaleAuctions does NOT transition POSTPONED or CANCELLED", () => {
    // These statuses must not appear in the OPEN_STATUSES list
    assert.ok(!expireLib.includes('"POSTPONED"'), "must not include POSTPONED in target set");
    assert.ok(!expireLib.includes('"CANCELLED"'), "must not include CANCELLED in target set");
  });

  it("expireStaleAuctions writes EXPIRED status", () => {
    assert.ok(expireLib.includes('"EXPIRED"') || expireLib.includes("'EXPIRED'"), "must write EXPIRED status");
    assert.ok(expireLib.includes("updateMany"), "must use updateMany for efficiency");
  });

  it("expireStaleAuctions writes an AuctionEvent for each changed auction", () => {
    assert.ok(expireLib.includes("auctionEvent"), "must write to auctionEvent relation");
    assert.ok(expireLib.includes("createMany"), "must use createMany for AuctionEvent rows");
  });

  it("expireStaleAuctions never hard-deletes", () => {
    assert.ok(!expireLib.includes(".delete("), "must not hard-delete any record");
    assert.ok(!expireLib.includes(".deleteMany("), "must not hard-deleteMany any records");
  });

  it("expiry endpoint is authenticated with CRON_SECRET", () => {
    assert.ok(expireRoute.includes("CRON_SECRET"), "endpoint must check CRON_SECRET");
    assert.ok(expireRoute.includes("timingSafeEqual"), "must use timing-safe comparison");
    assert.ok(expireRoute.includes("401"), "must return 401 for unauthorized requests");
  });

  it("expiry endpoint logs to source_run_logs", () => {
    assert.ok(expireRoute.includes("sourceRunLog") || expireRoute.includes("SourceRunLog"), "endpoint must log to source_run_logs");
    assert.ok(expireRoute.includes("Expiry job"), "must identify the source as Expiry job");
  });

  it("GitHub Actions workflow schedules the job at 02:00 IST (20:30 UTC)", () => {
    assert.ok(workflow.includes("30 20 * * *"), "workflow must run at 20:30 UTC = 02:00 IST");
  });

  it("expiry endpoint uses the expireStaleAuctions function", () => {
    assert.ok(expireRoute.includes("expireStaleAuctions"), "route must call expireStaleAuctions");
  });
});
