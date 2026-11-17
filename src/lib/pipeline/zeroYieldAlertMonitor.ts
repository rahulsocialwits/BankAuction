/*
 * Zero-yield alert integration layer: persists alert state to FeedSource.sheetState and writes
 * an operational log row (SourceRunLog kind="alert") when a source first enters a problem verdict.
 *
 * Pure logic lives in zeroYieldAlert.ts (no Prisma, fully testable).
 * Email delivery is behind a stub — replace the TODO comment when ADMIN_ALERT_EMAIL is approved.
 *
 * CONCURRENCY: the alert state is a read-modify-write on a JSON column. Two scheduler ticks
 * running concurrently would both read the same state, both decide to fire, and produce duplicate
 * alerts. We prevent this by locking the row with SELECT FOR UPDATE inside a transaction before
 * reading and writing sheetState.
 */

import { prisma } from "@/lib/db/prisma";
import { advanceAlertState, alertStateOf, verdictNote, withAlertState } from "./zeroYieldAlert";
import { logRun } from "./runLog";
import { isYieldProblem, type YieldVerdict } from "./zeroYield";
import { sendMail } from "@/lib/mail";

/**
 * Update the per-source alert suppression state and fire an alert row when warranted.
 *
 * Call this for EVERY verdict (including PRODUCTIVE and EMPTY), not only for problems:
 * a PRODUCTIVE verdict must reach here to reset suppression state so the next problem fires fresh.
 *
 * Never throws: alert delivery must not break a run.
 */
export async function notifyZeroYield(feedId: string, sourceName: string, verdict: YieldVerdict): Promise<void> {
  let shouldFireAlert = false;
  let firedVerdict: YieldVerdict | null = null;
  try {
    // SELECT FOR UPDATE locks the FeedSource row for the duration of the transaction,
    // preventing a concurrent tick from reading stale alert state and firing a duplicate.
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ sheetState: string | null }>>`
        SELECT "sheetState" FROM "feed_sources" WHERE id = ${feedId} FOR UPDATE
      `;
      if (!rows.length) return;
      const sheetState = rows[0].sheetState;
      const alertState = alertStateOf(sheetState);
      const { newState, fire } = advanceAlertState(verdict, alertState);
      await tx.feedSource.update({
        where: { id: feedId },
        data: { sheetState: withAlertState(sheetState, newState) },
      });
      if (fire) {
        shouldFireAlert = true;
        firedVerdict = verdict;
      }
    });
    // Write the run-log row outside the transaction: logRun reads historical runs and
    // has its own writes; keeping it inside would hold the row lock too long.
    if (shouldFireAlert && firedVerdict && isYieldProblem(firedVerdict)) {
      const alertMsg = `Zero-yield alert: source entered ${firedVerdict}. ${verdictNote(firedVerdict)} Suppression resets on recovery to PRODUCTIVE.`;
      await logRun({
        source: sourceName,
        kind: "alert",
        trigger: "schedule",
        status: "ok",
        message: alertMsg,
      });
      const alertEmail = process.env.ADMIN_ALERT_EMAIL?.trim();
      if (alertEmail) {
        // Fire-and-forget; a mail delivery failure must not break a run.
        sendMail(
          alertEmail,
          `[BankAuction] Zero-yield alert: ${sourceName}`,
          `Source: ${sourceName}\nVerdict: ${firedVerdict}\n\n${alertMsg}\n\nCheck Admin → Engine → History for details.`,
        ).catch(() => undefined);
      }
    }
  } catch {
    /* alert delivery must not break a run */
  }
}
