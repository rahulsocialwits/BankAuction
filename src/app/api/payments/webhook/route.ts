import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { markOrderPaid, verifyWebhookSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (Dashboard -> Webhooks, URL /api/payments/webhook, secret = RAZORPAY_WEBHOOK_SECRET). The raw body is verified
 * with the webhook secret first; anything unsigned is refused. It covers a customer who paid but closed the browser before the
 * verify step, and records failures and refunds.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret || !verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; refund?: { entity?: { payment_id?: string } } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const pay = event.payload?.payment?.entity;
  switch (event.event) {
    case "payment.captured":
    case "order.paid":
      if (pay?.order_id && pay.id) await markOrderPaid(pay.order_id, pay.id);
      break;
    case "payment.failed":
      if (pay?.order_id) await prisma.payment.updateMany({ where: { orderId: pay.order_id, status: "created" }, data: { status: "failed", paymentId: pay.id ?? null } });
      break;
    case "refund.processed": {
      const paymentId = event.payload?.refund?.entity?.payment_id;
      if (paymentId) await prisma.payment.updateMany({ where: { paymentId, status: "paid" }, data: { status: "refunded" } });
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
