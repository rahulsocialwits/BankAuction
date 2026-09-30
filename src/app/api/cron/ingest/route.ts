import { NextRequest, NextResponse, after } from "next/server";
import { runTick } from "@/lib/pipeline/tick";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HTTP-triggerable ingestion endpoint: the single "tick" that runs every live source
 * (built-in crawler + all active link sources). Call it every 30 minutes from any
 * scheduler: Vercel Cron, GitHub Actions, cron-job.org or UptimeRobot. Without one, visitor traffic
 * triggers a tick by itself (see /api/me), so sources stay live either way.
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

  // Schedulers like cron-job.org give up after ~30 s. Answer immediately and do the work after the response;
  // add ?wait=1 to run synchronously and see the full result (debugging).
  if (request.nextUrl.searchParams.get("wait") === "1") return NextResponse.json(await runTick({ limit, via: "HTTP" }));
  after(() => runTick({ limit, via: "HTTP" }).catch(() => undefined));
  return NextResponse.json({ accepted: true, note: "Running in the background; see Admin → Data Engine → Run History." }, { status: 202 });
}
