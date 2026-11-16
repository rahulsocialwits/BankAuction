import { prisma } from "@/lib/db/prisma";
import { nextChannelYield, overallYield, withYieldState, yieldStateOf, type YieldChannel, type YieldMarker, type YieldRun } from "./zeroYield";
import { notifyZeroYield } from "./zeroYieldAlertMonitor";

/**
 * Records one run of a generic source and returns the marker to put in its run-log row. Never throws and never blocks a run:
 * if the state cannot be read or written, the run simply has no yield verdict.
 * The streak lives in FeedSource.sheetState under the key "yield" (see zeroYield.ts).
 *
 * feedName is required only for alert logging (shown in Engine -> History); pass the source's display name.
 */
export async function recordYield(feedId: string, channel: YieldChannel, run: YieldRun, feedName?: string): Promise<YieldMarker | undefined> {
  try {
    const feed = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true, name: true } });
    if (!feed) return undefined;
    const state = yieldStateOf(feed.sheetState);
    const next = nextChannelYield(state[channel], run);
    state[channel] = next;
    await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: withYieldState(feed.sheetState, state) } });
    const overall = overallYield(state);
    // Always call notifyZeroYield — even for PRODUCTIVE — so a recovery resets the suppression
    // state and the next problem fires a fresh alert. The function handles all verdicts: fires an
    // alert row for problems, silently resets on PRODUCTIVE/EMPTY.
    if (overall) {
      await notifyZeroYield(feedId, feedName ?? feed.name, overall);
    }
    return { channel, verdict: overall === "PRODUCTIVE" ? "PRODUCTIVE" : next.verdict, discovered: run.discovered, streak: next.zeroStreak };
  } catch {
    return undefined;
  }
}
