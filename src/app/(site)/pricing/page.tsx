import type { Metadata } from "next";
import Link from "next/link";

const PLANS = [
  { label: "3 Month", price: 2500, note: "Refund on 1st week cancellation" },
  { label: "6 Month", price: 4000, was: 5000, note: "Save 20%" },
  { label: "1 Year", price: 7000, was: 10000, note: "Save 30%" },
];

const FEATURES = [
  "Full borrower name & contact details",
  "Auction document / notice access",
  "Auction history",
  "Daily mobile notification",
  "Daily email alert",
  "Multiple city email alert",
  "Email support",
];

export const metadata: Metadata = {
  title: "Pricing and Premium Access",
  description: "Plans for unlocking borrower details and official auction documents on BankAuction.co.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-semibold mb-2">BankAuction Premium</h1>
        <p className="text-brand-muted text-sm max-w-xl mx-auto">
          Unlock full borrower names, complete addresses, and priority alerts. Online payment isn&apos;t live yet —
          contact us to activate a plan manually in the meantime.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 mb-10">
        {PLANS.map((p) => (
          <div key={p.label} className="bg-white border border-brand-border rounded-2xl p-6 text-center">
            <div className="text-sm font-semibold text-brand-muted mb-1">{p.label} Premium</div>
            <div className="mb-1">
              {p.was && <span className="text-sm text-brand-muted line-through mr-2">₹{p.was.toLocaleString("en-IN")}</span>}
              <span className="text-2xl font-bold text-brand">₹{p.price.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-xs text-gold font-semibold mb-4">{p.note}</div>
            <p className="text-[11px] text-brand-muted mb-5">GST included</p>
            <Link href="/contact" className="block bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark text-sm">
              Contact to Upgrade
            </Link>
          </div>
        ))}
      </div>

      <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-md mx-auto">
        <div className="font-semibold mb-3">What&apos;s included</div>
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
