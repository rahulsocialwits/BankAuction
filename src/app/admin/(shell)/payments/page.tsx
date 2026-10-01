import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { getPaymentSettings, paymentEnvStatus } from "@/lib/payments/settings";
import { PaymentSettingsForm, TestGateway } from "@/components/admin/PaymentSettingsForm";
import { SITE_URL } from "@/lib/seo";
import { savePaymentSettings, testPaymentGateway } from "./actions";

export const dynamic = "force-dynamic";

function Row({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-brand-border first:border-0 text-sm">
      <span className="text-brand-muted">{label}</span>
      <span className={`text-right font-medium ${ok ? "text-green-700" : "text-amber-700"}`}>{text}</span>
    </div>
  );
}

export default async function PaymentsPage() {
  await requireMaster();
  const [s, recent, totals] = await Promise.all([
    getPaymentSettings(),
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const env = paymentEnvStatus();
  const ready = s.keyId && env.secretValid;
  const earned = (totals._sum.amount ?? 0) / 100;

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Payments</h1>
      <p className="text-sm text-brand-muted mb-6">Payment gateway for Premium plans. Master admin only.</p>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold mb-2">Gateway status</h2>
          <Row label="Provider" ok text="Razorpay" />
          <Row label="Mode" ok={s.mode === "live"} text={s.mode === "live" ? "Live" : "Test"} />
          <Row label="Accepting payments" ok={s.enabled && !!ready} text={s.enabled ? (ready ? "Yes" : "On, but keys incomplete") : "Off"} />
          <Row label="Key ID" ok={!!s.keyId} text={s.keyId ? `${s.keyId.slice(0, 12)}…` : "Not set"} />
          <Row label="Secret key (RAZORPAY_KEY_SECRET)" ok={env.secretValid} text={!env.hasSecret ? "Missing" : env.secretValid ? "Set" : "Invalid characters"} />
          <Row label="Webhook secret" ok={env.hasWebhookSecret} text={env.hasWebhookSecret ? "Set" : "Not set"} />
          <div className="mt-3"><TestGateway action={testPaymentGateway} /></div>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold mb-2">Revenue</h2>
          <div className="text-3xl font-semibold text-brand">₹{earned.toLocaleString("en-IN")}</div>
          <div className="text-xs text-brand-muted mt-1">{totals._count._all} paid payment{totals._count._all === 1 ? "" : "s"}</div>
          <p className="text-xs text-brand-muted mt-4">Totals appear here once online checkout is switched on and customers pay.</p>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5 text-xs text-brand-muted">
          <h2 className="font-semibold text-sm text-black mb-2">Set-up checklist</h2>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>Create a Razorpay account and copy the <b>Key ID</b> and <b>Key Secret</b> (Settings → API Keys).</li>
            <li>In Vercel add <code className="bg-brand-bg px-1 rounded">RAZORPAY_KEY_SECRET</code> as <b>Secret</b>, then redeploy.</li>
            <li>Paste the Key ID here, pick <b>Test</b> mode, save and press <b>Test connection</b>.</li>
            <li>Webhook URL for Razorpay: <code className="bg-brand-bg px-1 rounded break-all">{SITE_URL}/api/payments/razorpay/webhook</code>; add its signing secret as <code className="bg-brand-bg px-1 rounded">RAZORPAY_WEBHOOK_SECRET</code>.</li>
            <li>Test with test cards, then switch to <b>Live</b> with live keys.</li>
          </ol>
        </section>
      </div>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-4">Settings and plans</h2>
        <PaymentSettingsForm action={savePaymentSettings} initial={{ enabled: s.enabled, mode: s.mode, keyId: s.keyId, plans: s.plans }} />
      </section>

      <section className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border font-semibold text-sm">Recent payments</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-brand-bg text-left text-xs text-brand-muted">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-brand-border">
                  <td className="px-4 py-2.5 text-brand-muted">{p.createdAt.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">{p.email ?? "—"}</td>
                  <td className="px-4 py-2.5">{p.planId ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">₹{(p.amount / 100).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <div className="p-10 text-center text-sm text-brand-muted">No payments yet.</div>}
        </div>
      </section>
    </div>
  );
}
