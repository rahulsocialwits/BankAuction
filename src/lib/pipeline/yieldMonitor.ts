import { prisma } from "@/lib/db/prisma";
import { nextChannelYield, overallYield, withYieldState, yieldStateOf, type YieldChannel, type YieldMarker, type YieldRun } from "./zeroYield";

/**
 * Records one run of a generic source and returns the marker to put in its run-log row. Never throws and never blocks a run:
 * if the state cannot be read or written, the run simply has no yield verdict.
 * The streak lives in FeedSource.sheetState under the key "yield" (see zeroYield.ts).
 *
 * Queries the 7-day median of records_new from source_run_logs to gate the alert:
 * a source with a zero median has never reliably produced and must not trigger DROPPED/ZERO_YIELD.
 */
export async function recordYield(feedId: string, channel: YieldChannel, run: YieldRun): Promise<YieldMarker | undefined> {
  try {
    const feed = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true, name: true } });
    if (!feed) return undefined;

    // Compute 7-day median of `created` (records_new) for this source name from run logs.
    // Uses JS-side median so we avoid raw SQL; the row count over 7 days is small (at most ~2000).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
    const recentRows = await prisma.sourceRunLog.findMany({
      where: { source: feed.name, kind: { notIn: ["claim", "cron", "alert"] }, startedAt: { gte: sevenDaysAgo } },
      select: { created: true },
    });
    let sevenDayMedian = 0;
    if (recentRows.length > 0) {
      const sorted = recentRows.map((r) => r.created ?? 0).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      sevenDayMedian = sorted.length % 2 === 0 ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
    }

    const state = yieldStateOf(feed.sheetState);
    const next = nextChannelYield(state[channel], { ...run, sevenDayMedian });
    state[channel] = next;
    await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: withYieldState(feed.sheetState, state) } });
    return { channel, verdict: overallYield(state) === "PRODUCTIVE" ? "PRODUCTIVE" : next.verdict, discovered: run.discovered, streak: next.zeroStreak };
  } catch {
    return undefined;
  }
}
