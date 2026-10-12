import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { findActivePlan } from "@/lib/payments/razorpay";
import { paymentNote } from "@/lib/payments/premium";

export const dynamic = "force-dynamic";

/**
 * "Buy Premium" while online payment is not switched on: the logged-in user asks for a plan. It is saved as a "requested" row
 * (no money, no premium); the master admin sees it on Registered Users and activates Premium after confirming the payment.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { planId?: unknown };
  const plan = typeof body.planId === "string" ? await findActivePlan(body.planId) : null;
  if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 400 });
  const email = user.email.toLowerCase();
  const since = new Date(Date.now() - 7 * 864e5);
  const open = await prisma.payment.findFirst({ where: { email, planId: plan.id, status: "requested", createdAt: { gte: since } }, select: { id: true } });
  if (!open) {
    await prisma.payment.create({ data: { provider: "manual", email, planId: plan.id, amount: plan.priceInr * 100, status: "requested", note: paymentNote(plan.days, "admin", `requested ${plan.name}`) } });
  }
  return NextResponse.json({ ok: true, email, planName: plan.name });
}
