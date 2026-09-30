import { NextRequest, NextResponse, after } from "next/server";
import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { logRun } from "@/lib/pipeline/runLog";
import { autoCleanExactDuplicates } from "@/lib/pipeline/duplicates";

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

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");

  const tick = async () => {
    const startedAt = new Date();
    try {
      const summary = await runBankAuctionsIngestion({ limit, triggeredBy: "http-cron" });
      const feeds = await runAllFeeds();
      const hidden = await autoCleanExactDuplicates();
      await logRun({
        source: "Scheduler tick",
        kind: "cron",
        trigger: "cron",
        status: "ok",
        message: `via HTTP; built-in: ${summary.skipped ? "paused" : `${summary.newProperties} new`}; feeds run: ${feeds.length}; exact duplicates hidden: ${hidden}`,
        startedAt,
      });
      return { ...summary, feeds };
    } catch (e) {
      await logRun({ source: "Scheduler tick", kind: "cron", trigger: "cron", status: "error", message: e instanceof Error ? e.message : String(e), startedAt });
      throw e;
    }
  };

  // Schedulers like cron-job.org give up after ~30 s. Answer immediately and do the work after the response;
  // add ?wait=1 to run synchronously and see the full result (debugging).
  if (request.nextUrl.searchParams.get("wait") === "1") return NextResponse.json(await tick());
  after(() => tick().catch(() => undefined));
  return NextResponse.json({ accepted: true, note: "Running in the background; see Admin → Data Engine → Run History." }, { status: 202 });
}
