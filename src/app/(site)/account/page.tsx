import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { getPremium } from "@/lib/payments/premium";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const { paid } = await searchParams;
  const [premium, payments] = await Promise.all([
    getPremium(user.email),
    prisma.payment.findMany({ where: { email: user.email.toLowerCase(), provider: "razorpay", status: { in: ["paid", "refunded"] } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, planId: true, amount: true, status: true, paidAt: true, createdAt: true } }),
  ]);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-brand mb-1">My account</h1>
      <p className="text-sm text-brand-muted mb-6">{user.name ? `${user.name} · ` : ""}{user.email}</p>

      {paid === "1" && premium.premium && (
        <div className="mb-5 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3">Payment received. Premium is now active on your account.</div>
      )}

      <section className="bg-white border border-brand-border rounded-2xl p-6 mb-6">
        <div className="text-xs text-brand-muted mb-1">Your plan</div>
        {premium.premium && premium.until ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-brand">Premium</span>
              <span className="text-[11px] font-semibold bg-gold text-white rounded-full px-2.5 py-0.5">ACTIVE</span>
            </div>
            <p className="text-sm text-brand-muted mt-1">Valid until {fmtDate(premium.until)}{premium.source === "admin" ? " (activated by our team)" : ""}.</p>
          </>
        ) : (
          <>
            <div className="text-xl font-semibold text-brand">Free</div>
            <p className="text-sm text-brand-muted mt-1">Upgrade to unlock Premium features.</p>
            <Link href="/pricing" className="inline-block mt-3 bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark">See Premium plans</Link>
          </>
        )}
      </section>

      <section className="bg-white border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-3 text-sm">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-brand-muted">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-muted"><tr><th className="py-1.5">Date</th><th>Plan</th><th className="text-right">Amount</th><th className="text-right">Status</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-brand-border">
                  <td className="py-2">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  <td>{p.planId ?? "-"}</td>
                  <td className="text-right">₹{(p.amount / 100).toLocaleString("en-IN")}</td>
                  <td className="text-right capitalize">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex gap-4 text-sm">
        <Link href="/saved-properties" className="text-brand hover:underline">Saved properties</Link>
        <Link href="/my-alerts" className="text-brand hover:underline">My alerts</Link>
      </div>
    </main>
  );
}
