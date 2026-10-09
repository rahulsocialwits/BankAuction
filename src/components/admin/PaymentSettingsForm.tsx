"use client";

import { useActionState } from "react";
import SubmitButton from "./SubmitButton";
import type { PayFormState } from "@/app/admin/(shell)/payments/actions";
import { MAX_PLANS, type Plan } from "@/lib/payments/settings";

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";

function Msg({ s }: { s: PayFormState }) {
  if (!s) return null;
  return <span role="status" className={`text-sm break-words ${s.ok ? "text-green-700" : "text-red-600"}`}>{s.ok ? "✓ " : ""}{s.message}</span>;
}

export function TestGateway({ action }: { action: (prev: PayFormState) => Promise<PayFormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton className="border border-brand-border rounded-lg px-4 py-2 text-sm hover:bg-brand-bg">Test connection</SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function PaymentSettingsForm({
  action,
  initial,
}: {
  action: (prev: PayFormState, fd: FormData) => Promise<PayFormState>;
  initial: { enabled: boolean; mode: "test" | "live"; keyId: string; plans: Plan[] };
}) {
  const [state, formAction] = useActionState(action, null);
  const rows: (Plan | null)[] = [...initial.plans, ...Array(Math.max(0, MAX_PLANS - initial.plans.length)).fill(null)];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1">Mode</label>
          <select name="mode" defaultValue={initial.mode} className={input}>
            <option value="test">Test (no real money)</option>
            <option value="live">Live (real payments)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold mb-1">Razorpay Key ID (public)</label>
          <input name="keyId" defaultValue={initial.keyId} placeholder="rzp_test_xxxxxxxxxxxxxx" className={input} />
          <p className="text-[11px] text-brand-muted mt-1">The secret is never typed here. It goes in Vercel as RAZORPAY_KEY_SECRET.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} /> Accept online payments (needs working keys)
      </label>

      <div>
        <div className="text-sm font-semibold mb-2">Plans shown on the Pricing page</div>
        <div className="border border-brand-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-brand-bg text-left text-xs text-brand-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Price (₹)</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Show</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i} className="border-t border-brand-border">
                  <td className="px-3 py-2"><input type="hidden" name={`plan_${i}_id`} defaultValue={p?.id ?? ""} /><input name={`plan_${i}_name`} defaultValue={p?.name ?? ""} placeholder="e.g. 3 Month" className={input} /></td>
                  <td className="px-3 py-2 w-28"><input name={`plan_${i}_price`} inputMode="numeric" defaultValue={p?.priceInr ?? ""} className={input} /></td>
                  <td className="px-3 py-2 w-24"><input name={`plan_${i}_days`} inputMode="numeric" defaultValue={p?.days ?? ""} className={input} /></td>
                  <td className="px-3 py-2"><input name={`plan_${i}_note`} defaultValue={p?.note ?? ""} className={input} /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" name={`plan_${i}_active`} defaultChecked={p ? p.active : true} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-brand-muted mt-1">Leave a row&apos;s name empty to remove that plan.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Save payment settings</SubmitButton>
        <Msg s={state} />
      </div>
    </form>
  );
}
