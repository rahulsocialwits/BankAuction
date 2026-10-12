import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getPaymentSettings, paymentEnvStatus, type Plan } from "./settings";
import { paymentNote } from "./premium";

/* Razorpay helpers. The secret key and the webhook secret live only in environment variables and are never sent to the browser. */

const hmacHex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout success: Razorpay signs "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook: Razorpay signs the raw request body with the webhook secret (header X-Razorpay-Signature). */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

/** Is the gateway switched on and fully configured? (admin switch + key id + secret) */
export async function gatewayReady(): Promise<{ ready: boolean; keyId: string; mode: "test" | "live" }> {
  const s = await getPaymentSettings();
  const env = paymentEnvStatus();
  return { ready: s.enabled && !!s.keyId && env.secretValid, keyId: s.keyId, mode: s.mode };
}

export async function findActivePlan(planId: string): Promise<Plan | null> {
  const s = await getPaymentSettings();
  return s.plans.find((p) => p.id === planId && p.active) ?? null;
}

/** Creates the Razorpay order for a plan. The amount comes from the saved plan (never from the browser). */
export async function createRazorpayOrder(plan: Plan, email: string): Promise<{ orderId: string; amount: number; currency: string }> {
  const s = await getPaymentSettings();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const amount = plan.priceInr * 100; // paise
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${s.keyId}:${secret}`).toString("base64") },
    body: JSON.stringify({ amount, currency: s.currency || "INR", receipt: `ba_${Date.now()}`.slice(0, 40), notes: { plan: plan.id, email } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Razorpay answered HTTP ${res.status} when creating the order.`);
  const o = (await res.json()) as { id?: string; amount?: number; currency?: string };
  if (!o.id) throw new Error("Razorpay did not return an order id.");
  await prisma.payment.create({
    data: { provider: "razorpay", orderId: o.id, email: email.toLowerCase(), planId: plan.id, amount, currency: o.currency ?? "INR", status: "created", note: paymentNote(plan.days, "razorpay") },
  });
  return { orderId: o.id, amount, currency: o.currency ?? "INR" };
}

/** Marks an order paid once (idempotent: a second call, from the browser and the webhook, changes nothing). */
export async function markOrderPaid(orderId: string, paymentId: string): Promise<boolean> {
  const row = await prisma.payment.findUnique({ where: { orderId } });
  if (!row) return false;
  if (row.status === "paid") return true;
  await prisma.payment.update({ where: { orderId }, data: { status: "paid", paymentId, paidAt: new Date() } });
  return true;
}
