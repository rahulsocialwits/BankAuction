import type { Metadata } from "next";
import Link from "next/link";
import { getPaymentSettings } from "@/lib/payments/settings";
import { gatewayReady } from "@/lib/payments/razorpay";
import { getPremium } from "@/lib/payments/premium";
import { getCurrentUser } from "@/lib/auth/userSession";

const FEATURES = [
  "Auction document / notice access (availability varies by listing)",
  "Auction history",
  "Email support",
];

export const metadata: Metadata = {
  title: "Pricing and Premium Access",
  description: "Plans for unlocking borrower details and official auction documents on BankAuction.co.",
  alternates: { canonical: "/pricing" },
};

// Depends on who is looking (login, premium) and on the gateway switch, so it is rendered per request.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const settings = await getPaymentSettings();
  const [gw, user] = await Promise.all([gatewayReady(), getCurrentUser()]);
  const premium = await getPremium(user?.email);
  const PLANS = settings.plans
    .filter((p) => p.active)
    // No refund promise is shown until a refund policy and a working refund process are approved (founder decision). This also hides
    // a refund line saved earlier in Admin -> Payments.
    .map((p) => ({ id: p.id, label: p.name, price: p.priceInr, note: /refund/i.test(p.note) ? "" : p.note }));
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-semibold mb-2">BankAuction Premium</h1>
        <p className="text-brand-muted text-sm max-w-xl mx-auto">
          Premium gives you the official auction documents and notices. Personalised auction alerts are planned and are not yet available.
          {gw.ready ? " Pay securely online with Razorpay." : " Click Buy Premium to request a plan: our team confirms the payment with you and activates Premium on your account."}
        </p>
      </div>

      {premium.premium && premium.until && (
        <div className="max-w-xl mx-auto mb-8 rounded-2xl border border-gold bg-[#FFF8E6] px-5 py-4 text-center text-sm">
          <span className="font-semibold text-brand">You are a Premium member</span> until {premium.until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.{" "}
          <Link href="/account" className="text-gold font-semibold">View account →</Link>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-5 mb-10">
        {PLANS.map((p) => (
          <div key={p.label} className="bg-white border border-brand-border rounded-2xl p-6 text-center">
            <div className="text-sm font-semibold text-brand-muted mb-1">{p.label} Premium</div>
            <div className="mb-1">
              <span className="text-2xl font-bold text-brand">₹{p.price.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-xs text-gold font-semibold mb-4">{p.note}</div>
            <p className="text-[11px] text-brand-muted mb-5">GST included</p>
            <Link href={`/checkout?plan=${p.id}`} className="block bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark text-sm">
              {gw.ready ? "Buy now" : "Buy Premium"}
            </Link>
          </div>
        ))}
      </div>

      <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-md mx-auto">
        <div className="font-semibold mb-3">What Premium is planned to include</div>
        <ul className="text-sm space-y-2 text-black/80">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-gold">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs text-brand-muted mt-8">
        For any query or issue related to payment, please <Link href="/contact" className="text-brand hover:underline">contact us</Link>.
      </p>
    </main>
  );
}
