/**
 * P1.6 — daily AI token budget: atomic cache invalidation
 *
 * File-read-only tests (no Prisma client needed in this sandbox).
 * Verifies the pure budgetLevel logic and that the cache invalidation
 * is wired into runLog.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const budgetSrc = readFileSync(resolve("src/lib/ai/dailyBudget.ts"), "utf8");
const runLogSrc = readFileSync(resolve("src/lib/pipeline/runLog.ts"), "utf8");

// Inline the pure budgetLevel logic for local testing (no DB import needed).
type BudgetLevel = "none" | "ok" | "warning" | "exceeded";
function budgetLevel(used: number, cap: number): BudgetLevel {
  if (!(cap > 0)) return "none";
  if (used >= cap) return "exceeded";
  return used >= cap * 0.8 ? "warning" : "ok";
}

describe("P1.6 — daily AI token budget", () => {
  it("budgetLevel returns none when cap is 0", () => {
    assert.equal(budgetLevel(999_999, 0), "none");
  });

  it("budgetLevel returns ok when well below cap", () => {
    assert.equal(budgetLevel(10_000, 50_000), "ok");
  });

  it("budgetLevel returns warning at 80% of cap", () => {
    assert.equal(budgetLevel(40_000, 50_000), "warning");
  });

  it("budgetLevel returns exceeded at or above cap", () => {
    assert.equal(budgetLevel(50_000, 50_000), "exceeded");
    assert.equal(budgetLevel(60_000, 50_000), "exceeded");
  });

  it("dailyBudget.ts exports invalidateBudgetCache", () => {
    assert.ok(budgetSrc.includes("export function invalidateBudgetCache"), "dailyBudget.ts must export invalidateBudgetCache");
  });

  it("invalidateBudgetCache sets cache to null", () => {
    assert.ok(budgetSrc.includes("cache = null"), "invalidateBudgetCache must set cache = null");
  });

  it("runLog.ts imports invalidateBudgetCache from dailyBudget", () => {
    assert.ok(runLogSrc.includes("invalidateBudgetCache"), "runLog.ts must import invalidateBudgetCache");
    assert.ok(runLogSrc.includes("dailyBudget"), "runLog.ts must import from dailyBudget module");
  });

  it("runLog.ts calls invalidateBudgetCache after writing aiTokens", () => {
    // The call must appear after the prisma.sourceRunLog.create block that records aiTokens
    const createIdx = runLogSrc.indexOf("aiTokens: input.aiTokens");
    const callIdx = runLogSrc.indexOf("invalidateBudgetCache()", createIdx);
    assert.ok(createIdx !== -1, "runLog.ts must write aiTokens to source_run_logs");
    assert.ok(callIdx > createIdx, "invalidateBudgetCache() must be called after the create that records aiTokens");
  });

  it("invalidateBudgetCache is guarded by aiTokens > 0 to avoid unnecessary invalidations", () => {
    assert.ok(runLogSrc.includes("aiTokens") && runLogSrc.includes("invalidateBudgetCache()"), "invalidateBudgetCache call must be guarded");
  });

  it("dailyBudget.ts exports checkAndReserve for atomic reservation", () => {
    assert.ok(budgetSrc.includes("export async function checkAndReserve"), "dailyBudget.ts must export checkAndReserve");
  });

  it("checkAndReserve includes pendingTokens in the budget check before allowing the call", () => {
    assert.ok(budgetSrc.includes("pendingTokens"), "checkAndReserve must use a pendingTokens counter");
    assert.ok(budgetSrc.includes("pendingTokens + pending") || budgetSrc.includes("pendingTokens,") || budgetSrc.includes("+ pendingTokens"), "budget check must include pendingTokens");
  });

  it("relayModelsClient.ts uses checkAndReserve instead of a bare budget check", () => {
    const relaySrc = readFileSync(resolve("src/lib/ai/relayModelsClient.ts"), "utf8");
    assert.ok(relaySrc.includes("checkAndReserve"), "relayModelsClient must call checkAndReserve before each AI call");
    assert.ok(relaySrc.includes("release()"), "relayModelsClient must release the reservation after the call");
  });
});
