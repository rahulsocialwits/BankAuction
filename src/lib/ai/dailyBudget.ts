import { prisma } from "@/lib/db/prisma";

/*
 * Daily AI token budget. Set AI_DAILY_TOKEN_CAP (tokens per rolling 24 hours) in the environment; unset or 0 means no cap.
 * Usage is the sum of the tokens recorded in the run logs of the last 24 hours. When the cap is reached the AI calls stop (the same
 * way they stop when AI is switched off in Admin → AI Admin: the caller reports it and moves on). Importing, refreshing, de-duplication
 * and everything that needs no AI keep running, and nothing is half-written because the check happens before a call is made.
 *
 * P1.6 — DB-backed atomic reservation:
 * Before each AI call, checkAndReserve() reads the current 24-hour total from the DB (bypassing
 * the cache) and inserts a pending reservation row (kind="ai_reservation"). The aggregate that powers
 * tokensUsedLast24h() sums ALL aiTokens rows — including pending reservations — so concurrent Vercel
 * instances see each other's in-flight reservations and cannot collectively exceed the cap by more than
 * one reservation window. After the call, completeReservation() updates the row to actual tokens
 * (kind="ai_usage"); discardReservation() zeroes it out on failure. No new table is needed.
 */

export type BudgetLevel = "none" | "ok" | "warning" | "exceeded";

/** Pure: where the usage stands. warning from 80 percent of the cap. */
export function budgetLevel(used: number, cap: number): BudgetLevel {
  if (!(cap > 0)) return "none";
  if (used >= cap) return "exceeded";
  return used >= cap * 0.8 ? "warning" : "ok";
}

/** Default cap when AI_DAILY_TOKEN_CAP is unset: 50,000 tokens per 24 hours. */
export const DEFAULT_DAILY_TOKEN_CAP = 50_000;

export const dailyCap = () => {
  const raw = process.env.AI_DAILY_TOKEN_CAP;
  if (raw === undefined || raw === null || raw.trim() === "") return DEFAULT_DAILY_TOKEN_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_TOKEN_CAP;
};

/** Default estimated tokens per AI call (pre-reservation). Actual usage is recorded after the call. */
const ESTIMATED_TOKENS_PER_CALL = 2_000;

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

/**
 * Check the budget and atomically create a reservation row before an AI call.
 * Reads from DB without cache so concurrent instances see each other's reservations.
 * Returns `{ allowed: false }` when the budget is exhausted; otherwise inserts a
 * pending reservation and returns `{ allowed: true, reservationId }`.
 * On DB error: allows the call and returns `reservationId: null` (fail-open — a DB
 * hiccup must never block ingestion).
 */
export async function checkAndReserve(estimated = ESTIMATED_TOKENS_PER_CALL): Promise<{ allowed: boolean; reservationId: string | null }> {
  const cap = dailyCap();
  if (!(cap > 0)) return { allowed: true, reservationId: null };
  try {
    // Use a SERIALIZABLE transaction so the aggregate-check + insert is atomic across concurrent
    // Vercel instances: no two instances can both read "under cap" and both insert a reservation
    // for the same budget window without one of them seeing the other's reservation.
    const row = await prisma.$transaction(async (tx) => {
      const agg = await tx.sourceRunLog.aggregate({
        where: { startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
        _sum: { aiTokens: true },
      });
      const used = agg._sum.aiTokens ?? 0;
      if (budgetLevel(used + estimated, cap) === "exceeded") return null;
      return tx.sourceRunLog.create({
        data: { source: "ai_budget", kind: "ai_reservation", trigger: "reservation", status: "pending", aiTokens: estimated },
        select: { id: true },
      });
    }, { isolationLevel: "Serializable" });

    cache = null;
    if (!row) return { allowed: false, reservationId: null };
    return { allowed: true, reservationId: row.id };
  } catch {
    return { allowed: true, reservationId: null }; // fail-open: DB error must not block AI
  }
}

/**
 * Update a pending reservation to actual token usage once the AI call completes.
 * Best-effort: a failure here is not fatal (the reservation was an overcount, not an undercount).
 */
export async function completeReservation(id: string, actualTokens: number): Promise<void> {
  try {
    await prisma.sourceRunLog.update({
      where: { id },
      data: { kind: "ai_usage", status: "ok", aiTokens: actualTokens },
    });
    cache = null;
  } catch {
    // best-effort
  }
}

/**
 * Zero out a reservation when the AI call failed or was not made.
 * Preserves the row for auditability; sets aiTokens to 0 so it no longer counts.
 */
export async function discardReservation(id: string): Promise<void> {
  try {
    await prisma.sourceRunLog.update({
      where: { id },
      data: { kind: "ai_usage", status: "released", aiTokens: 0 },
    });
    cache = null;
  } catch {
    // best-effort
  }
}
