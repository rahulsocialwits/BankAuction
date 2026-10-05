import { prisma } from "@/lib/db/prisma";
import { builtInImportAll, runBankAuctionsIngestion, setBuiltInImportAll } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { autoCleanExactDuplicates } from "./duplicates";
import { logRun } from "./runLog";
import { enrichLocations } from "./geo";
import { autoReviewPending } from "./review";
import { revalidateTag } from "next/cache";
import { aiWindow, claimAiSlotWork, istLabel, nextSlotStart } from "./aiSchedule";

export type TickTrigger = "cron" | "visitor";

/**
 * One scheduler tick. Plain work (BankAuctions.in crawler, exact-duplicate cleanup, rule-based review) runs on every
 * tick. AI work (link-source page scans, location checks, AI review) runs only inside the AI schedule: the first
 * ~50 minutes after 00:00 / 06:00 / 12:00 / 18:00 IST (see aiSchedule.ts).
 */
export async function runTick(opts: { limit?: number; trigger?: TickTrigger; via?: string } = {}) {
  const startedAt = new Date();
  const trigger = opts.trigger ?? "cron";
  try {
    const window = aiWindow(startedAt);
    // Location checks and AI review are slot-wide jobs: exactly one tick per slot claims them.
    const slotWork = window.open ? await claimAiSlotWork(window.slotStart) : false;

    // "Import all" on: read every page of the site that was never read, as many as fit into this tick; switch off when none are left.
    const importAll = await builtInImportAll().catch(() => false);
    const summary = await runBankAuctionsIngestion(importAll ? { all: true, budgetMs: 110_000, triggeredBy: "http-cron" } : { limit: opts.limit ?? 100, triggeredBy: "http-cron" });
    if (importAll && !summary.skipped && summary.errors.length === 0 && !summary.remaining) await setBuiltInImportAll(false).catch(() => undefined);
    const feeds = await runAllFeeds({ aiSlotStart: window.open ? window.slotStart : null });
    const hidden = await autoCleanExactDuplicates();
    const geo = slotWork ? await enrichLocations(96).catch(() => ({ processed: 0, tokens: 0, failed: true })) : { processed: 0, tokens: 0, failed: false };
    const places = geo.processed;
    // Listings the importer was unsure about are reviewed automatically (rules every tick, AI only in the AI slot).
    const review = await autoReviewPending(slotWork ? 100 : 60, { useAi: slotWork }).catch(() => ({ published: 0, removed: 0, stillPending: 0, tokens: 0 }));
    const aiNote = slotWork
      ? `AI slot ${istLabel(window.slotStart)}: ran`
      : window.open
        ? `AI slot ${istLabel(window.slotStart)}: already ran`
        : `AI skipped (next AI scan ${istLabel(nextSlotStart(startedAt))})`;
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
      message: `via ${opts.via ?? "HTTP"}; built-in: ${summary.skipped ? "paused" : `${summary.newProperties} new`}; feeds run: ${feeds.length}${feeds.deferred ? ` (${feeds.deferred} AI source(s) wait for the AI slot)` : ""}; ${aiNote}; exact duplicates hidden: ${hidden}; locations checked by AI: ${places}; auto-review: ${review.published} published, ${review.removed} removed, ${review.stillPending} left`,
      aiTokens: geo.tokens + review.tokens,
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
