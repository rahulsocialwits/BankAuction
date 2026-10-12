import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/userSession";
import { createRazorpayOrder, findActivePlan, gatewayReady } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/** Starts a purchase: the logged-in user picks a plan id, the server creates the Razorpay order with the saved price. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { planId?: unknown };
  const plan = typeof body.planId === "string" ? await findActivePlan(body.planId) : null;
  if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 400 });
  const gw = await gatewayReady();
  if (!gw.ready) return NextResponse.json({ error: "payments_not_available" }, { status: 503 });
  try {
    const order = await createRazorpayOrder(plan, user.email);
    return NextResponse.json({ keyId: gw.keyId, mode: gw.mode, ...order, planName: plan.name, email: user.email, name: user.name ?? "" });
  } catch (e) {
    return NextResponse.json({ error: "order_failed", message: e instanceof Error ? e.message : "Could not start the payment." }, { status: 502 });
  }
}
