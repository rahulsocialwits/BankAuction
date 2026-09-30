import { NextRequest, NextResponse } from "next/server";
import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HTTP-triggerable ingestion endpoint. Exists as a backup to the GitHub
 * Actions cron, which can silently miss scheduled runs for hours at a time
 * on free-tier repos. Any external pinger (cron-job.org, UptimeRobot, etc.)
 * or a Vercel Cron Job can call this every 30 minutes instead/as well.
 */
export async function GET(request: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external pingers use ?secret= or x-cron-secret.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const summary = await runBankAuctionsIngestion({ limit, triggeredBy: "http-cron" });
  const feeds = await runAllFeeds();
  return NextResponse.json({ ...summary, feeds });
}
