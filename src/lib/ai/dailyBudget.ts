import { prisma } from "@/lib/db/prisma";

/*
 * Daily AI token budget. Set AI_DAILY_TOKEN_CAP (tokens per rolling 24 hours) in the environment; unset or 0 means no cap.
 * Usage is the sum of the tokens recorded in the run logs of the last 24 hours. When the cap is reached the AI calls stop (the same
 * way they stop when AI is switched off in Admin → AI Admin: the caller reports it and moves on). Importing, refreshing, de-duplication
 * and everything that needs no AI keep running, and nothing is half-written because the check happens before a call is made.
 */

export type BudgetLevel = "none" | "ok" | "warning" | "exceeded";

/** Pure: where the usage stands. warning from 80 percent of the cap. */
export function budgetLevel(used: number, cap: number): BudgetLevel {
  if (!(cap > 0)) return "none";
  if (used >= cap) return "exceeded";
  return used >= cap * 0.8 ? "warning" : "ok";
}

export const dailyCap = () => Number(process.env.AI_DAILY_TOKEN_CAP ?? "0") || 0;

let cache: { at: number; used: number } | null = null;
/** Tokens reserved by in-flight AI calls that have not yet been written to the DB. */
let pendingTokens = 0;

/** Drop the in-process cache so the next call re-reads from the DB. Call after recording AI tokens. */
export function invalidateBudgetCache(): void {
  cache = null;
}

/** Tokens used in the last 24 hours (cached for one minute so the check costs almost nothing). */
export async function tokensUsedLast24h(): Promise<number> {
  if (cache && Date.now() - cache.at < 60_000) return cache.used;
  const agg = await prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, _sum: { aiTokens: true } });
  cache = { at: Date.now(), used: agg._sum.aiTokens ?? 0 };
  return cache.used;
}

/**
 * Reserve `estimated` tokens before an AI call and check the budget atomically.
 * Concurrent callers each add to the shared pending counter before checking, so the cap
 * is enforced even when several calls start in the same millisecond.
 * Returns { ok, release }: call release() when the call finishes (success or error).
 */
export async function checkAndReserve(estimated: number): Promise<{ ok: boolean; release: () => void }> {
  pendingTokens += estimated;
  const cap = dailyCap();
  if (!(cap > 0)) {
    // No cap configured — always allow; still track pending so the counter stays meaningful.
    let released = false;
    return { ok: true, release: () => { if (!released) { pendingTokens = Math.max(0, pendingTokens - estimated); released = true; } } };
  }
  let exceeded = false;
  try {
    exceeded = budgetLevel(await tokensUsedLast24h() + pendingTokens, cap) === "exceeded";
  } catch {
    // DB read failure: allow the call (same policy as dailyBudgetExceeded).
  }
  if (exceeded) {
    pendingTokens = Math.max(0, pendingTokens - estimated);
    return { ok: false, release: () => {} };
  }
  let released = false;
  return { ok: true, release: () => { if (!released) { pendingTokens = Math.max(0, pendingTokens - estimated); released = true; } } };
}

export async function dailyBudgetExceeded(): Promise<boolean> {
  const cap = dailyCap();
  if (!(cap > 0)) return false;
  try {
    return budgetLevel(await tokensUsedLast24h() + pendingTokens, cap) === "exceeded";
  } catch {
    return false; // a database hiccup must never stop the engine
  }
}
