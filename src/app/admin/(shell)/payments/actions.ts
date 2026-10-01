"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin } from "@/lib/auth/adminAuth";
import { MAX_PLANS, type Plan } from "@/lib/payments/settings";

export type PayFormState = { ok: boolean; message: string } | null;
const DENY = { ok: false, message: "Only the master admin can do this." } as const;

export async function savePaymentSettings(_prev: PayFormState, formData: FormData): Promise<PayFormState> {
  if (!(await isMasterAdmin())) return DENY;
  try {
    const keyId = String(formData.get("keyId") ?? "").trim();
    if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId)) throw new Error("Key ID should look like rzp_test_xxxxxxxx or rzp_live_xxxxxxxx (the public key id, not the secret).");
    const mode = formData.get("mode") === "live" ? "live" : "test";
    if (keyId && !keyId.startsWith(`rzp_${mode}_`)) throw new Error(`Mode is "${mode}" but the key id is for the other mode.`);

    const plans: Plan[] = [];
    for (let i = 0; i < MAX_PLANS; i++) {
      const name = String(formData.get(`plan_${i}_name`) ?? "").trim();
      const price = Number(String(formData.get(`plan_${i}_price`) ?? "").replace(/[,₹\s]/g, ""));
      if (!name) continue;
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Plan "${name}": enter a price in rupees.`);
      plans.push({
        id: String(formData.get(`plan_${i}_id`) ?? "") || `p${i + 1}`,
        name: name.slice(0, 40),
        priceInr: Math.round(price),
        days: Math.max(1, Math.round(Number(formData.get(`plan_${i}_days`)) || 30)),
        note: String(formData.get(`plan_${i}_note`) ?? "").trim().slice(0, 80),
        active: formData.get(`plan_${i}_active`) === "on",
      });
    }
    if (plans.length === 0) throw new Error("Keep at least one plan.");

    const data = { enabled: formData.get("enabled") === "on", mode, keyId: keyId || null, plans: JSON.stringify(plans) };
    await prisma.paymentSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    revalidatePath("/pricing");
    revalidatePath("/admin/payments");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save." };
  }
}

/** Calls Razorpay with the saved key id and the secret from the environment to prove the pair works. */
export async function testPaymentGateway(): Promise<PayFormState> {
  if (!(await isMasterAdmin())) return DENY;
  const row = await prisma.paymentSettings.findUnique({ where: { id: "default" } });
  const keyId = row?.keyId || process.env.RAZORPAY_KEY_ID?.trim() || "";
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
  if (!keyId) return { ok: false, message: "Save a Key ID first." };
  if (!secret) return { ok: false, message: "RAZORPAY_KEY_SECRET is not set in the environment (Vercel → Settings → Environment Variables)." };
  if (/[^\x20-\x7E]/.test(secret)) return { ok: false, message: "RAZORPAY_KEY_SECRET has invalid characters (looks like a masked value). Re-paste it." };
  try {
    const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${secret}`).toString("base64") },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { ok: true, message: `Connected to Razorpay (${keyId.startsWith("rzp_live_") ? "live" : "test"} keys work).` };
    if (res.status === 401) return { ok: false, message: "Razorpay rejected the keys (401). Check that the Key ID and secret belong together." };
    return { ok: false, message: `Razorpay answered HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? `Could not reach Razorpay: ${e.message}` : "Could not reach Razorpay." };
  }
}
