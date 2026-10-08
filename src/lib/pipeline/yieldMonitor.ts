import { prisma } from "@/lib/db/prisma";
import { nextChannelYield, overallYield, withYieldState, yieldStateOf, type YieldChannel, type YieldMarker, type YieldRun } from "./zeroYield";

/**
 * Records one run of a generic source and returns the marker to put in its run-log row. Never throws and never blocks a run:
 * if the state cannot be read or written, the run simply has no yield verdict.
 * The streak lives in FeedSource.sheetState under the key "yield" (see zeroYield.ts).
 */
export async function recordYield(feedId: string, channel: YieldChannel, run: YieldRun): Promise<YieldMarker | undefined> {
  try {
    const feed = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
    if (!feed) return undefined;
    const state = yieldStateOf(feed.sheetState);
    const next = nextChannelYield(state[channel], run);
    state[channel] = next;
    await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: withYieldState(feed.sheetState, state) } });
    return { channel, verdict: overallYield(state) === "PRODUCTIVE" ? "PRODUCTIVE" : next.verdict, discovered: run.discovered, streak: next.zeroStreak };
  } catch {
    return undefined;
  }
}
