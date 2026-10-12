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
  assert.equal((actions.match(/requireMaster\(\)/g) ?? []).length, 3, "all three admin actions (premium, normal, reset link) are master-only");
  const razor = readFileSync("src/lib/payments/razorpay.ts", "utf8");
  assert.doesNotMatch(razor, /deleteMany|\.delete\(/, "payments are never deleted");
});

test("Buy Premium without online payment only records a request: no premium, no money, and a request gives nothing by itself", () => {
  const req = readFileSync("src/app/api/payments/request/route.ts", "utf8");
  assert.match(req, /login_required/);
  assert.match(req, /status: "requested"/);
  assert.doesNotMatch(req, /status: "paid"|grantPremium|markOrderPaid/);
  assert.equal(computePremium([row({ status: "requested", note: paymentNote(90, "admin") })], now).premium, false);
  const btn = readFileSync("src/components/BuyPlanButton.tsx", "utf8");
  assert.match(btn, /\/api\/payments\/request/);
});

test("the receipt page: login needed, only the owner of a paid or refunded online payment, and it says it is not a GST invoice", () => {
  const r = readFileSync("src/app/(site)/account/receipt/[id]/page.tsx", "utf8");
  assert.match(r, /redirect\("\/login/);
  assert.match(r, /pay\.email !== user\.email\.toLowerCase\(\)/);
  assert.match(r, /provider !== "razorpay"/);
  assert.match(r, /not a GST tax invoice/);
});

test("official document links reach only a logged-in Premium user: the page lists the rows, the links come from a private API", () => {
  const api = readFileSync("src/app/api/property-docs/[slug]/route.ts", "utf8");
  assert.ok(api.indexOf("login_required") < api.indexOf("premium_required"));
  assert.ok(api.indexOf("premium_required") < api.indexOf("prisma.propertyDocument"), "the premium check comes before any document is read");
  assert.match(api, /no-store/);
  const page = readFileSync("src/app/(site)/property/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(page, /document.sourceUrl/, "the property page does not put document addresses in its HTML");
  assert.match(readFileSync("src/components/PropertyDocuments.tsx", "utf8"), /user\?\.premium/);
});

test("page speed: the home page reads its data from one cached call, and the search page sends only the selected city's areas", () => {
  const home = readFileSync("src/app/(site)/page.tsx", "utf8");
  assert.match(home, /getHomeData\(\)/);
  assert.doesNotMatch(home, /prisma\.property\.count|prisma\.auction\.count|prisma\.property\.groupBy/);
  assert.match(readFileSync("src/lib/queries/homeData.ts", "utf8"), /unstable_cache/);
  const props = readFileSync("src/app/(site)/properties/page.tsx", "utf8");
  assert.match(props, /selectedAreas\(localities, city\)/);
  assert.match(props, /areas: \[\]/);
});

test("home page speed: the city tiles are picked in one pass (a nested findIndex over ~2,000 cities took about 14 seconds)", () => {
  const home = readFileSync("src/app/(site)/page.tsx", "utf8");
  assert.doesNotMatch(home, /findIndex\([^)]*canonCity/);
  assert.match(home, /picked\.has\(key\)/);
  assert.match(home, /homeCities\.length >= 8/);
});

test("checkout page: a plan from the saved plans, a login first, a summary with the price, and the pricing buttons lead to it", () => {
  const c = readFileSync("src/app/(site)/checkout/page.tsx", "utf8");
  assert.match(c, /findActivePlan\(planId\)/);
  assert.ok(c.indexOf("redirect(`/login?next=") > c.indexOf("findActivePlan"));
  assert.match(c, /Order summary/);
  assert.match(c, /GST included/);
  assert.match(c, /BuyPlanButton planId=\{plan\.id\}/);
  const pricing = readFileSync("src/app/(site)/pricing/page.tsx", "utf8");
  assert.match(pricing, /href=\{`\/checkout\?plan=\$\{p\.id\}`\}/);
  assert.doesNotMatch(c, /RAZORPAY_KEY_SECRET|keySecret/, "the secret never appears in the page");
});
