import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { acquireTickLease, runTick } from "@/lib/pipeline/tick";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * HTTP-triggerable ingestion endpoint: the single "tick" that runs every live source
 * (built-in crawler + all active link sources). The GitHub Actions workflow (.github/workflows/tick.yml) calls it every 5 minutes;
 * a second, independent pinger (cron-job.org, UptimeRobot; see docs/SCHEDULER.md) can call it too: a tick lease keeps them from overlapping. Without one, visitor traffic triggers a tick by itself (see /api/me).
 * Auth: ?secret=<CRON_SECRET>, header x-cron-secret, or "Authorization: Bearer <CRON_SECRET>".
 *
 * Returns 202 Accepted immediately after the tick is accepted (lease acquired). The tick runs as a background promise
 * that Vercel keeps alive until maxDuration (300 s). This avoids cron-job.org's 30-second response timeout while
 * still guaranteeing the full tick runs; results are visible in Admin → Engine → History as usual.
 * A "skipped" response (202 with skipped:true) means another trigger already owns this tick window.
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set on the server" }, { status: 500 });
  const expected = Buffer.from(process.env.CRON_SECRET, "utf8");
  const received = Buffer.from(secret ?? "", "utf8");
  const authorized = expected.length === received.length && timingSafeEqual(expected, received);
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const started = Date.now();
  // Several triggers may call this endpoint (GitHub Actions, an external pinger): only one tick runs at a time. A trigger that finds
  // another tick running (or one that just ran) answers 202 "skipped" and does nothing, so a second pinger is always safe.
  const lease = await acquireTickLease("HTTP");
  if ("skipped" in lease) return NextResponse.json({ ok: true, skipped: true, reason: lease.skipped, ms: Date.now() - started });

  // Schedule the tick to run after the response is sent, using next/server `after()`.
  // `after()` is the Vercel-native API for background work: it registers the callback in Vercel's
  // waitUntil mechanism rather than relying on a dangling promise, so the platform guarantees
  // the work runs even after the HTTP response is flushed. maxDuration = 300 caps the total
  // function lifetime (response + background) to 300 s.
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 100;
  after(async () => {
    try {
      await runTick({ limit: safeLimit, via: "HTTP", trigger: "cron", claimId: lease.id });
    } catch (e: unknown) {
      console.error("[cron/ingest] background tick failed:", e instanceof Error ? e.message : String(e));
    }
  });

  return NextResponse.json({ ok: true, status: "accepted", claimId: lease.id, ms: Date.now() - started }, { status: 202 });
}
