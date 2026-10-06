import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/pipeline/tick";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * HTTP-triggerable ingestion endpoint: the single "tick" that runs every live source
 * (built-in crawler + all active link sources). The GitHub Actions workflow (.github/workflows/tick.yml) calls it every 5 minutes;
 * any other scheduler (cron-job.org, UptimeRobot) can too. Without one, visitor traffic triggers a tick by itself (see /api/me).
 * Auth: ?secret=<CRON_SECRET>, header x-cron-secret, or "Authorization: Bearer <CRON_SECRET>".
 *
 * The tick runs INSIDE this request and the response is sent only after it finished, so the scheduler sees HTTP 200 only when the
 * work was really done. A failure is returned as HTTP 500 with the real error (never swallowed, never reported as "ok").
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set on the server" }, { status: 500 });
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const started = Date.now();
  try {
    const result = await runTick({ limit: Number.isFinite(limit) && limit > 0 ? limit : 100, via: "HTTP", trigger: "cron" });
    return NextResponse.json({ ok: true, ms: Date.now() - started, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/ingest] tick failed:", e);
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: message }, { status: 500 });
  }
}
