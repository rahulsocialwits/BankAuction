/**
 * P1.1 — cron-job.org timeout fix
 *
 * Verifies that the ingest route returns 202 immediately after acquiring the lease
 * rather than awaiting the full tick (which can take up to 262 s).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routePath = resolve("src/app/api/cron/ingest/route.ts");
const src = readFileSync(routePath, "utf8");

describe("P1.1 — cron ingest async (cron-job.org timeout fix)", () => {
  it("returns 202 status, not 200", () => {
    assert.ok(src.includes("status: 202"), "response must use HTTP 202 Accepted");
  });

  it("schedules tick via after() not a bare void promise", () => {
    // after() from next/server registers work in Vercel's waitUntil mechanism —
    // the platform guarantees the callback runs even after the HTTP response is flushed.
    assert.ok(src.includes("after("), "must use after() from next/server for background work");
    assert.ok(!src.includes("void runTick("), "must not use bare void runTick() fire-and-forget");
  });

  it("imports after from next/server", () => {
    assert.ok(src.includes("after") && src.includes("next/server"), "after must be imported from next/server");
  });

  it("includes status:accepted in the response body", () => {
    assert.ok(src.includes('"accepted"') || src.includes("'accepted'"), "response body must include status: accepted");
  });

  it("includes claimId in the response body", () => {
    assert.ok(src.includes("claimId"), "response body must include claimId for observability");
  });

  it("maxDuration is set to 300 so Vercel keeps the function alive after response", () => {
    assert.ok(src.includes("maxDuration = 300"), "maxDuration must be 300 to allow background tick to finish");
  });
});
