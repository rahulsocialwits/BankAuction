/*
 * Zero-yield alert suppression: fires once when a source first enters ZERO_YIELD, DROPPED or ALL_REJECTED,
 * and suppresses duplicate alerts until the source recovers to PRODUCTIVE.
 *
 * Alert state is stored under FeedSource.sheetState["alertState"] alongside the existing yield state.
 * The notification itself is written as a SourceRunLog row (kind="alert") — a clean, searchable record
 * the admin can read in Engine -> History. Email delivery is behind a stub (see notifyZeroYield).
 *
 * This module is split into pure functions (no I/O, fully testable) and an integration layer.
 *
 * THRESHOLD COMPARISON vs original requirement ("alert after two consecutive zero-new ticks when
 * the source's seven-day median is positive"):
 *
 * The requirement describes: 2 consecutive runs where `created = 0` AND the source has been
 * productive in the last 7 days → alert.
 *
 * The underlying zeroYield.ts logic (which this layer wraps) uses different rules:
 *   • DROPPED:    source was EVER productive and NOW finds 0 listings → fires on the FIRST zero tick
 *                 (more eager than "2 consecutive", but also covers layout changes rather than just
 *                 "created = 0 runs")
 *   • ZERO_YIELD: source was NEVER productive AND has ≥3 consecutive zero-discovery runs spanning
 *                 ≥6 hours → fires (more conservative than "2 consecutive")
 *   • ALL_REJECTED: finds listings but all are rejected on 3 consecutive runs
 *
 * Key difference: "7-day median is positive" is NOT checked; instead, the channel state tracks
 * `lastProductiveAt` to distinguish never-productive from dropped sources. The "2 consecutive"
 * threshold is not enforced; DROPPED fires on the first zero tick.
 *
 * To match the original requirement exactly (2 runs, 7-day window), the ZERO_YIELD_AFTER_RUNS
 * constant in zeroYield.ts would need to be 2 for previously-productive sources, and the median
 * check would need production DB access — a schema-impacting change deferred to a future PR.
 */

import { isYieldProblem, type YieldVerdict } from "./zeroYield";

/** Persisted per-source alert state, stored under FeedSource.sheetState["alertState"]. */
export interface AlertState {
  /** The verdict that triggered the last alert, or null if the source has never been alerted. */
  lastAlertedVerdict: YieldVerdict | null;
  /** ISO timestamp of the last alert. */
  lastAlertedAt: string | null;
  /** Number of consecutive ticks suppressed since the last alert (for diagnostics). */
  suppressedCount: number;
}

const EMPTY_ALERT_STATE: AlertState = { lastAlertedVerdict: null, lastAlertedAt: null, suppressedCount: 0 };

/** Read the alert state from a FeedSource.sheetState JSON string. Never throws. */
export function alertStateOf(raw: string | null | undefined): AlertState {
  try {
    const j = raw ? JSON.parse(raw) : null;
    const a = j?.alertState;
    if (!a || typeof a !== "object") return { ...EMPTY_ALERT_STATE };
    return {
      lastAlertedVerdict: typeof a.lastAlertedVerdict === "string" ? (a.lastAlertedVerdict as YieldVerdict) : null,
      lastAlertedAt: typeof a.lastAlertedAt === "string" ? a.lastAlertedAt : null,
      suppressedCount: typeof a.suppressedCount === "number" ? a.suppressedCount : 0,
    };
  } catch {
    return { ...EMPTY_ALERT_STATE };
  }
}

/** Write the alert state back into a sheetState JSON string, preserving all other keys. Never throws. */
export function withAlertState(raw: string | null | undefined, state: AlertState): string {
  let j: Record<string, unknown> = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { /* start fresh */ }
  j.alertState = state;
  return JSON.stringify(j);
}

/**
 * Returns true when this run should fire an alert.
 *
 * Fires when:
 *   - The current verdict is a problem (ZERO_YIELD | DROPPED | ALL_REJECTED) AND
 *   - Either no previous alert exists OR the previous alert was for a different (or non-problem) verdict.
 *
 * Suppresses when:
 *   - The source was already alerted for the same problem verdict (even if the streak grows).
 *
 * Resets when:
 *   - The source returns to PRODUCTIVE; the next problem will fire a fresh alert.
 */
export function shouldAlert(currentVerdict: YieldVerdict | null, alertState: AlertState): boolean {
  if (!currentVerdict || !isYieldProblem(currentVerdict)) return false;
  // Already alerted for exactly this verdict: suppress.
  if (alertState.lastAlertedVerdict === currentVerdict) return false;
  return true;
}

/**
 * Advance the alert state for one tick. Returns the new state and whether an alert should fire.
 * Pure: no I/O, fully testable.
 */
export function advanceAlertState(
  currentVerdict: YieldVerdict | null,
  alertState: AlertState,
  now: Date = new Date(),
): { newState: AlertState; fire: boolean } {
  if (!currentVerdict || !isYieldProblem(currentVerdict)) {
    // Source is healthy or unknown: reset if we had a pending alert
    if (alertState.lastAlertedVerdict !== null) {
      return { newState: { ...EMPTY_ALERT_STATE }, fire: false };
    }
    return { newState: alertState, fire: false };
  }
  if (shouldAlert(currentVerdict, alertState)) {
    return {
      newState: { lastAlertedVerdict: currentVerdict, lastAlertedAt: now.toISOString(), suppressedCount: 0 },
      fire: true,
    };
  }
  // Same problem: suppress and count
  return {
    newState: { ...alertState, suppressedCount: alertState.suppressedCount + 1 },
    fire: false,
  };
}

export function verdictNote(v: YieldVerdict): string {
  switch (v) {
    case "ZERO_YIELD": return "The source has never found a listing over several runs. Check for a changed URL, login wall or JavaScript-only site.";
    case "DROPPED": return "The source used to find listings and now finds none. Check for a site layout change or new block.";
    case "ALL_REJECTED": return "The source finds listings but every one is rejected (missing price, date or address). Check the site's data format.";
    default: return "";
  }
}
