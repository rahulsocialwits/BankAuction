/*
 * Zero-yield alert integration layer: persists alert state to FeedSource.sheetState and writes
 * an operational log row (SourceRunLog kind="alert") when a source first enters a problem verdict.
 *
 * Pure logic lives in zeroYieldAlert.ts (no Prisma, fully testable).
 * Email delivery is behind a stub — replace the TODO comment when ADMIN_ALERT_EMAIL is approved.
 */

import { prisma } from "@/lib/db/prisma";
import { advanceAlertState, alertStateOf, verdictNote, withAlertState } from "./zeroYieldAlert";
import { logRun } from "./runLog";
import type { YieldVerdict } from "./zeroYield";

/**
 * Check the suppression state for a source, fire an alert if warranted, and persist the new state.
 * Never throws: alert delivery must not break a run.
 */
export async function notifyZeroYield(feedId: string, sourceName: string, verdict: YieldVerdict): Promise<void> {
  try {
    const feed = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
    if (!feed) return;
    const alertState = alertStateOf(feed.sheetState);
    const { newState, fire } = advanceAlertState(verdict, alertState);
    await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: withAlertState(feed.sheetState, newState) } });
    if (!fire) return;
    // Operational log: visible in Admin -> Engine -> History as an "alert" kind row.
    // TODO: also send an email to process.env.ADMIN_ALERT_EMAIL when a provider is configured.
    await logRun({
      source: sourceName,
      kind: "alert",
      trigger: "schedule",
      status: "ok",
      message: `Zero-yield alert: source entered ${verdict}. ${verdictNote(verdict)} Suppression resets on recovery to PRODUCTIVE.`,
    });
  } catch {
    /* alert delivery must not break a run */
  }
}
