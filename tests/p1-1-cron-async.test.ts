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

  it("does not await runTick before returning the response", () => {
    // The response must come before runTick resolves.
    // Pattern: void runTick(...).catch(...) followed by return NextResponse.json(...)
    const voidRunTickIdx = src.indexOf("void runTick(");
    const returnJsonIdx = src.indexOf("return NextResponse.json(", voidRunTickIdx);
    assert.ok(voidRunTickIdx !== -1, "runTick must be fire-and-forget (void runTick(...))");
    assert.ok(returnJsonIdx > voidRunTickIdx, "return must come after the void runTick(...) call");
  });

  it("does not use await runTick in the main path", () => {
    // 'await runTick' anywhere after the lease acquisition means synchronous execution
    // We allow 'await acquireTickLease' but not 'await runTick'
    const awaitRunTick = /await\s+runTick\s*\(/.test(src);
    assert.ok(!awaitRunTick, "runTick must not be awaited on the response path");
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
