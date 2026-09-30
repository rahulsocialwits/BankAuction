import { NextRequest, NextResponse } from "next/server";
import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { logRun } from "@/lib/pipeline/runLog";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HTTP-triggerable ingestion endpoint: the single "tick" that runs every source
 * (built-in crawler + all active link sources). Call it every 30 minutes from any
 * scheduler: Vercel Cron, GitHub Actions, cron-job.org or UptimeRobot.
 * Auth: ?secret=<CRON_SECRET>, header x-cron-secret, or "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external pingers use ?secret= or x-cron-secret.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const summary = await runBankAuctionsIngestion({ limit, triggeredBy: "http-cron" });
  const feeds = await runAllFeeds();
  await logRun({
    source: "Scheduler tick",
    kind: "cron",
    trigger: "cron",
    status: "ok",
    message: `via HTTP; built-in: ${summary.skipped ? "paused" : `${summary.newProperties} new`}; feeds run: ${feeds.length}`,
    startedAt,
  });
  return NextResponse.json({ ...summary, feeds });
}
