/*
 * Tick lease (pure rules). Several things can start a tick: the GitHub schedule, an external pinger, visitors. Two ticks must never
 * run at once (they would read the same sources twice). Before a tick starts it takes a lease: a "claim" marker row in SourceRunLog.
 * The lease is released (kind "claim_done") when the tick ends; a claim older than CLAIM_STALE_MS belongs to a run that was cut off.
 */

export const CLAIM_STALE_MS = 6 * 60_000; // a tick ends within 300 s
export const MIN_TICK_GAP_MS = 3 * 60_000; // a trigger this soon after the previous tick STARTED is a duplicate (must stay below the 5-minute rhythm)

/** Why a new tick may not start now, or null when it may. `rows` are recent "claim" / "cron" / "claim_done" rows. */
export function leaseBlockedBy(rows: { kind: string; startedAt: Date }[], now: Date, minGapMs = MIN_TICK_GAP_MS): string | null {
  for (const r of rows) {
    const age = now.getTime() - r.startedAt.getTime();
    if (r.kind === "claim" && age < CLAIM_STALE_MS) return "another tick is running";
    if (r.kind === "cron" && age < minGapMs) return "a tick just ran";
  }
  return null;
}

/** Of simultaneous claim markers, exactly one wins: the earliest, ties broken by id. Every claimant computes the same answer. */
export function leaseWinner(markers: { id: string; startedAt: Date }[]): string | null {
  const sorted = [...markers].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[0]?.id ?? null;
}
