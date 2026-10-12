"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayCheckout { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void }
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout }
}

function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** "Buy now": creates the order on the server, opens the Razorpay popup, then asks the server to verify the payment. */
export default function BuyPlanButton({ planId, label, loggedIn, online = true }: { planId: string; label: string; loggedIn: boolean; online?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function buy() {
    if (!loggedIn) return router.push("/login?next=/pricing");
    setBusy(true);
    setMsg(null);
    let opened = false; // once the popup is open, its own callbacks end the busy state
    try {
      if (!online) {
        // Online payment is not switched on yet: send a request, the team activates Premium after confirming the payment.
        const r = await fetch("/api/payments/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
        if (r.status === 401) return router.push("/login?next=/pricing");
        const d = (await r.json().catch(() => ({}))) as { email?: string };
        setMsg(r.ok ? `Request received for ${label} Premium. Our team will contact you at ${d.email ?? "your email"} to complete the payment and activate Premium.` : "Could not send the request. Please try again or contact us.");
        if (r.ok) setDone(true);
        return;
      }
      const res = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      if (res.status === 401) return router.push("/login?next=/pricing");
      const order = (await res.json()) as { keyId?: string; orderId?: string; amount?: number; currency?: string; planName?: string; email?: string; name?: string; error?: string; message?: string };
      if (!res.ok || !order.orderId || !order.keyId) {
        setMsg(order.error === "payments_not_available" ? "Online payment is not available right now. Please contact us." : order.message ?? "Could not start the payment. Please try again.");
        return;
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        setMsg("Could not load the payment window. Check your connection and try again.");
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "BankAuction.co",
        description: `${order.planName ?? label} Premium`,
        order_id: order.orderId,
        prefill: { name: order.name, email: order.email },
        theme: { color: "#10213d" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: RazorpayResponse) => {
          const v = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
          if (v.ok) router.push("/account?paid=1");
          else setMsg("We could not confirm the payment yet. If money was deducted, Premium is activated automatically within a few minutes, or contact us.");
          setBusy(false);
        },
      });
      rzp.on("payment.failed", (e) => { setMsg(e.error?.description ?? "The payment failed. You were not charged."); setBusy(false); });
      opened = true;
      rzp.open();
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      if (!opened) setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={buy} disabled={busy || done} className="block w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark text-sm disabled:opacity-60">
        {busy ? (online ? "Opening payment…" : "Sending…") : done ? "Request sent" : loggedIn ? (online ? "Buy now" : "Buy Premium") : "Sign in to buy"}
      </button>
      {msg && <p role="status" className={`mt-2 text-xs ${done ? "text-green-700" : "text-red-700"}`}>{msg}</p>}
    </div>
  );
}
