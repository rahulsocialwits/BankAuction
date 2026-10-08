import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/auth/userSession";
import { claimTick, runTick } from "@/lib/pipeline/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a visitor-triggered source tick may run in the background after the reply

/**
 * Tiny per-visitor endpoint so cached pages never have to read cookies during render.
 * It also doubles as the always-on safety net for the data engine: if no scheduled tick ran in the
 * last ~35 minutes, this request starts one in the background (after the reply, so visitors never wait).
 */
export async function GET() {
  const user = await getCurrentUser();
  after(async () => {
    const claimId = await claimTick();
    if (claimId) await runTick({ limit: 40, trigger: "visitor", via: "visitor traffic", claimId }).catch(() => undefined);
  });
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email } : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
