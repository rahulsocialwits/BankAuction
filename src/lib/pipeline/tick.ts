import { prisma } from "@/lib/db/prisma";
import { builtInImportAll, runBankAuctionsIngestion, setBuiltInImportAll } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { autoCleanExactDuplicates } from "./duplicates";
import { logRun } from "./runLog";
import { enrichLocations } from "./geo";
import { autoReviewPending } from "./review";
import { revalidateTag } from "next/cache";
import { snapshotCoverageIfDue } from "./coverageHistoryStore";
import { aiWindow, claimAiSlotWork, istLabel, nextSlotStart } from "./aiSchedule";
import { CLAIM_STALE_MS, leaseBlockedBy, leaseWinner } from "./tickLease";

export type TickTrigger = "cron" | "visitor";

/**
 * One scheduler tick. Plain work (BankAuctions.in crawler, exact-duplicate cleanup, rule-based review) runs on every
 * tick. AI work (link-source page scans, location checks, AI review) runs only inside the AI schedule: the first
 * ~50 minutes after 00:00 / 06:00 / 12:00 / 18:00 IST (see aiSchedule.ts).
 */
export async function runTick(opts: { limit?: number; trigger?: TickTrigger; via?: string; /** the lease taken by whoever started this tick; released when the tick ends */ claimId?: string } = {}) {
  const startedAt = new Date();
  const trigger = opts.trigger ?? "cron";
  try {
    const window = aiWindow(startedAt);
    // Location checks and AI review are slot-wide jobs: exactly one tick per slot claims them.
    const slotWork = window.open ? await claimAiSlotWork(window.slotStart) : false;

    // "Import all" on: read every page of the site that was never read, as many as fit into this tick; switch off when none are left.
    const importAll = await builtInImportAll().catch(() => false);
    const summary = await runBankAuctionsIngestion(importAll ? { all: true, budgetMs: 110_000, triggeredBy: "http-cron" } : { limit: opts.limit ?? 100, budgetMs: 60_000, triggeredBy: "http-cron" });
    if (importAll && !summary.skipped && summary.errors.length === 0 && !summary.remaining) await setBuiltInImportAll(false).catch(() => undefined);
    // the whole tick must be over before the 300 s function limit (a cut-off tick writes no log row and skips its clean-up)
    const hardEnd = startedAt.getTime() + 262_000;
    const feeds = await runAllFeeds({ aiSlotStart: window.open ? window.slotStart : null, hardEnd });
    const hidden = await autoCleanExactDuplicates();
    // one small reading per India day of how many current unique actionable auctions we hold (reads auctions, writes only its own rows)
    await snapshotCoverageIfDue().catch(() => undefined);
    const timeLeft = hardEnd - Date.now();
    const geo = slotWork && timeLeft > 60_000 ? await enrichLocations(96).catch(() => ({ processed: 0, tokens: 0, failed: true })) : { processed: 0, tokens: 0, failed: false };
    const places = geo.processed;
    // Listings the importer was unsure about are reviewed automatically (rules every tick, AI only in the AI slot).
    const review = await autoReviewPending(slotWork && timeLeft > 60_000 ? 100 : 60, { useAi: slotWork && timeLeft > 60_000 }).catch(() => ({ published: 0, removed: 0, stillPending: 0, tokens: 0 }));
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
  } finally {
    if (opts.claimId) await releaseTickLease(opts.claimId);
  }
}

/**
 * Lease for one tick, taken by EVERY trigger (GitHub Actions, an external pinger, visitors) before it runs a tick, so two ticks can
 * never overlap and a second trigger shortly after the first is a harmless no-op. Rules: tickLease.ts. Fails closed: if the database
 * cannot be read or written, no tick is started by this trigger (the next trigger tries again).
 */
export async function acquireTickLease(who: string): Promise<{ id: string } | { skipped: string }> {
  try {
    const now = new Date();
    const rows = await prisma.sourceRunLog.findMany({
      where: { kind: { in: ["claim", "cron"] }, startedAt: { gte: new Date(now.getTime() - CLAIM_STALE_MS) } },
      select: { kind: true, startedAt: true },
    });
    const blocked = leaseBlockedBy(rows, now);
    if (blocked) return { skipped: blocked };
    const mine = await prisma.sourceRunLog.create({ data: { source: "Scheduler claim", kind: "claim", trigger: "schedule", status: "ok", message: `${who} tick claimed`, startedAt: now } });
    const markers = await prisma.sourceRunLog.findMany({ where: { kind: "claim", startedAt: { gte: new Date(now.getTime() - 60_000) } }, select: { id: true, startedAt: true } });
    if (leaseWinner(markers) === mine.id) return { id: mine.id };
    await releaseTickLease(mine.id);
    return { skipped: "another trigger claimed this tick first" };
  } catch (e) {
    return { skipped: `the lease could not be taken (${e instanceof Error ? e.message.slice(0, 80) : "unknown error"})` };
  }
}

/** Ends a lease: the claim row stops blocking the next tick. Never throws. */
export async function releaseTickLease(id: string): Promise<void> {
  await prisma.sourceRunLog.update({ where: { id }, data: { kind: "claim_done" } }).catch(() => undefined);
}

const TICK_EVERY_MS = 35 * 60 * 1000;
let lastCheck = 0;

/**
 * Safety net that needs no outside scheduler: visitors (and the admin) call this cheaply; if no tick ran
 * in the last ~35 minutes, one of them starts it in the background. An outside scheduler (cron-job.org,
 * GitHub Actions) still works and simply keeps the tick from ever being "late".
 * Returns the claim id when this call claimed the tick and the caller should run it (and pass the id to runTick), otherwise null.
 */
export async function claimTick(): Promise<string | null> {
  // Cheap guard: a busy instance checks the database at most once a minute.
  if (Date.now() - lastCheck < 60_000) return null;
  lastCheck = Date.now();
  try {
    // While an "Import all" is running (a website source or the built-in crawler) the safety net does not wait 35 minutes: it keeps the
    // import moving about every 5 minutes, like the GitHub Actions scheduler would. Without one it stays at 35 minutes.
    const importing = !!(await prisma.feedSource.findFirst({ where: { active: true, sheetState: { contains: '"importAll":true' } }, select: { id: true } }).catch(() => null)) || (await builtInImportAll().catch(() => false));
    const every = importing ? 5 * 60_000 : TICK_EVERY_MS;
    const recent = await prisma.sourceRunLog.findFirst({
      where: {
        OR: [
          { kind: "cron", startedAt: { gte: new Date(Date.now() - every) } },
          { kind: "claim", startedAt: { gte: new Date(Date.now() - 6 * 60_000) } }, // a tick is still running (a run ends within 300 s)
        ],
      },
      select: { id: true },
    });
    if (recent) return null;

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
    if (rivals[0]?.id === mine.id) return mine.id; // the caller passes it to runTick, which releases it when the tick ends
    await releaseTickLease(mine.id);
    return null;
  } catch {
    return null;
  }
}
