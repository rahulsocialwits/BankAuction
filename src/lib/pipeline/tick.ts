import { prisma } from "@/lib/db/prisma";
import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { autoCleanExactDuplicates } from "./duplicates";
import { logRun } from "./runLog";
import { enrichLocations } from "./geo";
import { revalidateTag } from "next/cache";

export type TickTrigger = "cron" | "visitor";

/** One scheduler tick: every live source runs (link sources are throttled to once an hour each). */
export async function runTick(opts: { limit?: number; trigger?: TickTrigger; via?: string } = {}) {
  const startedAt = new Date();
  const trigger = opts.trigger ?? "cron";
  try {
    const summary = await runBankAuctionsIngestion({ limit: opts.limit ?? 100, triggeredBy: "http-cron" });
    const feeds = await runAllFeeds();
    const hidden = await autoCleanExactDuplicates();
    const geo = await enrichLocations(48).catch(() => ({ processed: 0, tokens: 0, failed: true }));
    const places = geo.processed;
    if (places > 0) {
      try {
        revalidateTag("localities", "max");
      } catch {
        /* not in a Next request context (command-line run) */
      }
    }
    await logRun({
      source: "Scheduler tick",
      kind: "cron",
      trigger: trigger === "visitor" ? "schedule" : "cron",
      status: "ok",
      message: `via ${opts.via ?? "HTTP"}; built-in: ${summary.skipped ? "paused" : `${summary.newProperties} new`}; feeds run: ${feeds.length}; exact duplicates hidden: ${hidden}; locations checked by AI: ${places}`,
      aiTokens: geo.tokens,
      startedAt,
    });
    return { ...summary, feeds };
  } catch (e) {
    await logRun({ source: "Scheduler tick", kind: "cron", trigger: trigger === "visitor" ? "schedule" : "cron", status: "error", message: e instanceof Error ? e.message : String(e), startedAt });
    throw e;
  }
}

const TICK_EVERY_MS = 35 * 60 * 1000;
let lastCheck = 0;

/**
 * Safety net that needs no outside scheduler: visitors (and the admin) call this cheaply; if no tick ran
 * in the last ~35 minutes, one of them starts it in the background. An outside scheduler (cron-job.org,
 * GitHub Actions) still works and simply keeps the tick from ever being "late".
 * Returns true when this call claimed the tick and the caller should run it.
 */
export async function claimTick(): Promise<boolean> {
  // Cheap guard: a busy instance checks the database at most once a minute.
  if (Date.now() - lastCheck < 60_000) return false;
  lastCheck = Date.now();
  try {
    const recent = await prisma.sourceRunLog.findFirst({
      where: {
        OR: [
          { kind: "cron", startedAt: { gte: new Date(Date.now() - TICK_EVERY_MS) } },
          { kind: "claim", startedAt: { gte: new Date(Date.now() - 10 * 60_000) } }, // a tick is still running
        ],
      },
      select: { id: true },
    });
    if (recent) return false;

    // Claim by writing a marker row first; if two requests race, only the earliest marker wins.
    const claimedAt = new Date();
    const mine = await prisma.sourceRunLog.create({
      data: { source: "Scheduler claim", kind: "claim", trigger: "schedule", status: "ok", message: "visitor-triggered tick claimed", startedAt: claimedAt },
    });
    const rivals = await prisma.sourceRunLog.findMany({
      where: { kind: "claim", startedAt: { gte: new Date(claimedAt.getTime() - 60_000) } },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: 1,
      select: { id: true },
    });
    return rivals[0]?.id === mine.id;
  } catch {
    return false;
  }
}
