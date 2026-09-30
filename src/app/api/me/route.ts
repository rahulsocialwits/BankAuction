import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/userSession";

export const dynamic = "force-dynamic";

/** Tiny per-visitor endpoint so cached pages never have to read cookies during render. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email } : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
