import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { expireStaleAuctions } from "@/lib/pipeline/expireAuctions";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily cleanup: marks open auctions whose auction date was more than 7 days ago as EXPIRED.
 * Scheduled at 02:00 IST (20:30 UTC the previous day) via GitHub Actions expire.yml.
 * Auth: same CRON_SECRET as the ingest endpoint.
 *
 * Idempotent — safe to call multiple times. Never hard-deletes.
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set on the server" }, { status: 500 });
  const expected = Buffer.from(process.env.CRON_SECRET, "utf8");
  const received = Buffer.from(secret ?? "", "utf8");
  const authorized = expected.length === received.length && timingSafeEqual(expected, received);
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const startedAt = new Date();
  try {
    const result = await expireStaleAuctions();
    await prisma.sourceRunLog.create({
      data: {
        source: "Expiry job",
        kind: "cron",
        trigger: "cron",
        status: "ok",
        message: `Expired ${result.expired} stale auction(s) (cutoff: ${result.cutoffDate.toISOString()})`,
        startedAt,
      },
    });
    return NextResponse.json({ ok: true, expired: result.expired, cutoffDate: result.cutoffDate.toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/expire] expiry job failed:", e);
    await prisma.sourceRunLog.create({
      data: { source: "Expiry job", kind: "cron", trigger: "cron", status: "error", message, startedAt },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
