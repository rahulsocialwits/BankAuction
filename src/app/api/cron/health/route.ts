import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { LATE_AFTER_MIN, schedulerHealth } from "@/lib/pipeline/schedulerHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler health for outside monitors. Answers 200 while a successful tick happened in the last 60 minutes and 503 when not,
 * so ANY uptime monitor (UptimeRobot, cron-job.org, the GitHub watchdog workflow) can alert on a non-200 answer, independently of
 * GitHub's own scheduler. Same secret as /api/cron/ingest (?secret=, x-cron-secret, or Bearer).
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set on the server" }, { status: 500 });
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const last = await prisma.sourceRunLog.findFirst({ where: { kind: "cron", status: "ok" }, orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } });
    const h = schedulerHealth(last, new Date());
    return NextResponse.json(
      { ok: !h.late, state: h.state, late: h.late, minutesSinceLastSuccessfulTick: h.ageMin, limitMinutes: LATE_AFTER_MIN },
      { status: h.late ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
