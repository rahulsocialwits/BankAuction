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

/** Tokens used in the last 24 hours (cached for one minute so the check costs almost nothing). */
export async function tokensUsedLast24h(): Promise<number> {
  if (cache && Date.now() - cache.at < 60_000) return cache.used;
  const agg = await prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, _sum: { aiTokens: true } });
  cache = { at: Date.now(), used: agg._sum.aiTokens ?? 0 };
  return cache.used;
}

export async function dailyBudgetExceeded(): Promise<boolean> {
  const cap = dailyCap();
  if (!(cap > 0)) return false;
  try {
    return budgetLevel(await tokensUsedLast24h(), cap) === "exceeded";
  } catch {
    return false; // a database hiccup must never stop the engine
  }
}
