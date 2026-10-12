import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { computePremium, paymentNote, type PaymentRow } from "../src/lib/payments/premium";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../src/lib/payments/razorpay";

const DAY = 86_400_000;
const now = new Date("2026-10-12T10:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const row = (o: Partial<PaymentRow> & { status: string }): PaymentRow => ({ createdAt: ago(1), paidAt: null, planId: "3m", note: null, ...o });
const paid = (daysAgo: number, days: number, by: "razorpay" | "admin" = "razorpay") => row({ status: "paid", paidAt: ago(daysAgo), createdAt: ago(daysAgo), note: paymentNote(days, by) });

test("nobody is premium without a paid row; a created or failed order gives nothing", () => {
  assert.equal(computePremium([], now).premium, false);
  assert.equal(computePremium([row({ status: "created", note: paymentNote(90, "razorpay") }), row({ status: "failed" })], now).premium, false);
});

test("a paid purchase is premium for its days, then ends", () => {
  const p = computePremium([paid(10, 90)], now);
  assert.equal(p.premium, true);
  assert.equal(p.source, "razorpay");
  assert.equal(p.until?.getTime(), ago(10).getTime() + 90 * DAY);
  assert.equal(computePremium([paid(100, 90)], now).premium, false);
});

test("the master admin can make a user premium and then normal again; the history stays", () => {
  const grant = paid(2, 30, "admin");
  assert.equal(computePremium([grant], now).source, "admin");
  const revoked = row({ status: "revoked", createdAt: ago(1), paidAt: ago(1) });
  assert.equal(computePremium([grant, revoked], now).premium, false);
  // premium granted AFTER the revoke is in force again
  assert.equal(computePremium([grant, revoked, paid(0.5, 30, "admin")], now).premium, true);
});

test("a refund ends the premium of the purchase", () => {
  assert.equal(computePremium([paid(5, 90), row({ status: "refunded", createdAt: ago(1), paidAt: ago(1) })], now).premium, false);
});

test("a paid row without a readable plan length never makes anyone premium", () => {
  assert.equal(computePremium([row({ status: "paid", paidAt: ago(1), note: "garbage" })], now).premium, false);
});

test("checkout signature: only the HMAC of order_id|payment_id with the secret is accepted", () => {
  const secret = "test_secret_value";
  const sig = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  assert.equal(verifyCheckoutSignature("order_1", "pay_1", sig, secret), true);
  assert.equal(verifyCheckoutSignature("order_1", "pay_2", sig, secret), false);
  assert.equal(verifyCheckoutSignature("order_1", "pay_1", sig, "other"), false);
  assert.equal(verifyCheckoutSignature("order_1", "pay_1", "", secret), false);
  assert.equal(verifyCheckoutSignature("order_1", "pay_1", sig, ""), false);
});

test("webhook signature: the raw body signed with the webhook secret", () => {
  const body = '{"event":"payment.captured"}';
  const sig = createHmac("sha256", "whsec").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, sig, "whsec"), true);
  assert.equal(verifyWebhookSignature(body + " ", sig, "whsec"), false);
  assert.equal(verifyWebhookSignature(body, sig, ""), false);
});

test("the server decides: price from the saved plan, premium only after a verified signature or a signed webhook", () => {
  const order = readFileSync("src/app/api/payments/order/route.ts", "utf8");
  assert.match(order, /findActivePlan\(body\.planId\)/);
  assert.doesNotMatch(order, /body\.amount|body\.price/);
  const verify = readFileSync("src/app/api/payments/verify/route.ts", "utf8");
  assert.match(verify, /verifyCheckoutSignature\(/);
  assert.ok(verify.indexOf("verifyCheckoutSignature(") < verify.indexOf("markOrderPaid("), "signature is checked before the order is marked paid");
  assert.match(verify, /order_not_yours/);
  const hook = readFileSync("src/app/api/payments/webhook/route.ts", "utf8");
  assert.ok(hook.indexOf("verifyWebhookSignature(") < hook.indexOf("markOrderPaid("));
  const actions = readFileSync("src/app/admin/(shell)/users/actions.ts", "utf8");
  assert.equal((actions.match(/requireMaster\(\)/g) ?? []).length, 2, "both admin actions are master-only");
  const razor = readFileSync("src/lib/payments/razorpay.ts", "utf8");
  assert.doesNotMatch(razor, /deleteMany|\.delete\(/, "payments are never deleted");
});
