import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/userSession";
import { findActivePlan, gatewayReady } from "@/lib/payments/razorpay";
import { getPremium } from "@/lib/payments/premium";
import BuyPlanButton from "@/components/BuyPlanButton";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Checkout: the plan, what you get, the price and one button. Needs a login; the payment itself is Razorpay's secure popup. */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId = "" } = await searchParams;
  const plan = planId ? await findActivePlan(planId) : null;
  if (!plan) redirect("/pricing");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout?plan=${plan.id}`)}`);
  const [gw, premium] = await Promise.all([gatewayReady(), getPremium(user.email)]);

  return (
    <main className="w-full px-5 py-12 max-w-3xl mx-auto">
      <Link href="/pricing" className="text-sm text-brand hover:underline">← All plans</Link>
      <h1 className="text-2xl font-semibold text-brand mt-3 mb-6">Checkout</h1>

      <div className="grid md:grid-cols-5 gap-6">
        <section className="md:col-span-3 bg-white border border-brand-border rounded-2xl p-6">
          <h2 className="font-semibold mb-4 text-sm">Order summary</h2>
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-brand-border">
            <div>
              <div className="font-medium">{plan.name} Premium</div>
              <div className="text-xs text-brand-muted mt-0.5">{plan.days} days of Premium access from the day of payment</div>
              {plan.note && !/refund/i.test(plan.note) && <div className="text-xs text-gold font-semibold mt-1">{plan.note}</div>}
            </div>
            <div className="font-semibold">₹{plan.priceInr.toLocaleString("en-IN")}</div>
          </div>
          <div className="flex items-center justify-between pt-4">
            <div>
              <div className="font-semibold">Total</div>
              <div className="text-[11px] text-brand-muted">GST included</div>
            </div>
            <div className="text-2xl font-bold text-brand">₹{plan.priceInr.toLocaleString("en-IN")}</div>
          </div>
          <div className="mt-5 pt-4 border-t border-brand-border text-sm">
            <div className="text-xs text-brand-muted mb-1">Account</div>
            <div>{user.name ? `${user.name} · ` : ""}{user.email}</div>
          </div>
          {premium.premium && premium.until && (
            <p className="mt-4 rounded-lg bg-[#FFF8E6] border border-gold px-3 py-2 text-xs text-brand">
              You are already Premium until {fmt(premium.until)}. A new purchase starts from the day you pay.
            </p>
          )}
        </section>

        <aside className="md:col-span-2 bg-white border border-brand-border rounded-2xl p-6 self-start">
          <h2 className="font-semibold mb-3 text-sm">What you get</h2>
          <ul className="text-sm space-y-2 text-black/80 mb-5">
            <li className="flex gap-2"><span className="text-gold">✓</span> Official auction documents and notices</li>
            <li className="flex gap-2"><span className="text-gold">✓</span> Auction history of a property</li>
            <li className="flex gap-2"><span className="text-gold">✓</span> Email support</li>
          </ul>
          <BuyPlanButton planId={plan.id} label={plan.name} loggedIn online={gw.ready} cta={gw.ready ? `Pay ₹${plan.priceInr.toLocaleString("en-IN")} securely` : "Request this plan"} />
          <p className="text-[11px] text-brand-muted mt-3">
            {gw.ready
              ? "You pay on Razorpay's secure window (UPI, cards, net banking). We never see your card details. Premium turns on as soon as the payment is confirmed."
              : "Online payment is being set up. Press the button and our team will contact you to complete the payment and switch Premium on."}
          </p>
        </aside>
      </div>
    </main>
  );
}
