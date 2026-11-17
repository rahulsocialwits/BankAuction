/**
 * Stagnation detection for feed sources.
 *
 * A source is stagnant when it has completed N or more consecutive runs
 * that produced zero new listings AND was not marked as a one-shot/completed source.
 * This is distinct from zero-yield (which also fires on stagnation) and targets
 * specifically the case where a paginated source returns the same page content
 * repeatedly or a cursor stops advancing.
 *
 * Rules:
 * - Only fires for sources with at least STAGNATION_RUNS consecutive "unchanged" runs.
 * - Non-paginated sources (e.g. a sheet with no rows left) are not flagged: an unchanged
 *   sheet is normal once all rows are imported. We distinguish by checking whether the
 *   source is still receiving MORE_PENDING continuation runs.
 * - Never fires for BAANKNET or ACRE runs (they have their own status paths).
 * - The warning is logged to SourceRunLog as a separate "stagnation_check" kind row.
 */

export const STAGNATION_RUNS = 3; // consecutive unchanged runs before we warn

export interface StagnationRun {
  /** True when this run produced zero new records AND finished cleanly (not an error/blocked run). */
  unchanged: boolean;
  /** True when the source still has more data to import on the next run (pagination in progress). */
  morePending: boolean;
}

export interface StagnationResult {
  stagnant: boolean;
  /** Consecutive unchanged run count at the time of the check. */
  streak: number;
  warning?: string;
}

/**
 * Pure: given the last N runs (most-recent last), returns whether the source is stagnant.
 * Does not query the database; callers supply the run history.
 */
export function checkStagnation(runs: StagnationRun[]): StagnationResult {
  if (runs.length === 0) return { stagnant: false, streak: 0 };

  // Count consecutive unchanged runs from the end (most recent).
  let streak = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    if (!run.unchanged) break;
    // A run with morePending is paginating through a large source: not stagnant.
    if (run.morePending) break;
    streak++;
  }

  if (streak < STAGNATION_RUNS) return { stagnant: false, streak };

  return {
    stagnant: true,
    streak,
    warning: `Stagnation warning: ${streak} consecutive runs returned no new listings and no data appears to be pending. Check whether the source URL still has live auction data.`,
  };
}

/**
 * Build StagnationRun records from SourceRunLog message text.
 * The "unchanged" flag is derived from canonical message patterns written by run.ts.
 * The "morePending" flag is derived from MORE_PENDING sentinel ("Continues automatically.").
 */
export function stagnationRunFromMessage(message: string | null | undefined, created: number): StagnationRun {
  const text = message ?? "";
  const unchanged =
    created === 0 &&
    (text.includes("No changes") ||
      text.includes("Unchanged:") ||
      text.includes("Duplicate:") ||
      text.includes("unchanged"));
  const morePending = text.includes("Continues automatically.") || text.includes("continue on the next run");
  return { unchanged, morePending };
}
