import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { markOrderPaid, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { getPremium } from "@/lib/payments/premium";

export const dynamic = "force-dynamic";

/** After the Razorpay popup succeeds: the signature is checked with the secret key; only then is the order marked paid. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!b.razorpay_order_id || !b.razorpay_payment_id || !b.razorpay_signature || !verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }
  const row = await prisma.payment.findUnique({ where: { orderId: b.razorpay_order_id } });
  if (!row || row.email !== user.email.toLowerCase()) return NextResponse.json({ error: "order_not_yours" }, { status: 403 });
  await markOrderPaid(b.razorpay_order_id, b.razorpay_payment_id);
  const p = await getPremium(user.email);
  return NextResponse.json({ ok: true, premium: p.premium, until: p.until });
}
