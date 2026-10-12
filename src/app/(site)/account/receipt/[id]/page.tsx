import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { getPaymentSettings } from "@/lib/payments/settings";
import PrintButton from "@/components/PrintButton";

export const metadata: Metadata = { title: "Payment receipt", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** A printable payment receipt for one of the logged-in user's own online payments. It is a receipt, not a GST tax invoice. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const { id } = await params;
  const pay = await prisma.payment.findUnique({ where: { id } });
  // only the owner of the payment, only real online payments that were paid (or later refunded)
  if (!pay || pay.email !== user.email.toLowerCase() || pay.provider !== "razorpay" || !["paid", "refunded"].includes(pay.status)) notFound();
  const settings = await getPaymentSettings();
  const plan = settings.plans.find((p) => p.id === pay.planId);
  const amount = pay.amount / 100;
  const when = pay.paidAt ?? pay.createdAt;

  return (
    <main className="w-full px-5 py-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link href="/account" className="text-sm text-brand hover:underline">← My account</Link>
        <PrintButton />
      </div>
      <article className="bg-white border border-brand-border rounded-2xl p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xl font-semibold text-brand">BankAuction.co</div>
            <div className="text-xs text-brand-muted">auction.bizsocio.com</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">Payment receipt</div>
            <div className="text-xs text-brand-muted">No. {pay.id.slice(-10).toUpperCase()}</div>
            <div className="text-xs text-brand-muted">{fmt(when)}</div>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-6">
          <div><dt className="text-xs text-brand-muted">Billed to</dt><dd>{user.name ? `${user.name} · ` : ""}{user.email}</dd></div>
          <div><dt className="text-xs text-brand-muted">Status</dt><dd className="capitalize">{pay.status}</dd></div>
          <div><dt className="text-xs text-brand-muted">Payment ID</dt><dd className="break-all">{pay.paymentId ?? "-"}</dd></div>
          <div><dt className="text-xs text-brand-muted">Order ID</dt><dd className="break-all">{pay.orderId ?? "-"}</dd></div>
        </dl>

        <table className="w-full text-sm mb-6">
          <thead className="text-left text-xs text-brand-muted border-b border-brand-border">
            <tr><th className="py-2">Item</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-brand-border">
              <td className="py-3">BankAuction Premium{plan ? `: ${plan.name} (${plan.days} days)` : pay.planId ? ` (${pay.planId})` : ""}</td>
              <td className="text-right">₹{amount.toLocaleString("en-IN")}</td>
            </tr>
            <tr>
              <td className="py-3 font-semibold">Total paid (GST included)</td>
              <td className="text-right font-semibold">₹{amount.toLocaleString("en-IN")} {pay.currency}</td>
            </tr>
          </tbody>
        </table>

        {pay.status === "refunded" && <p className="text-sm text-amber-700 mb-4">This payment was refunded and the Premium access ended.</p>}
        <p className="text-[11px] text-brand-muted">
          This is a payment receipt for an online payment made through Razorpay. It is not a GST tax invoice. If you need a tax invoice, contact us
          from the Contact page with the payment ID above.
        </p>
      </article>
    </main>
  );
}
