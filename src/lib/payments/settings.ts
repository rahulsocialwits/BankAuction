import { prisma } from "@/lib/db/prisma";

export interface Plan {
  id: string;
  name: string;
  priceInr: number;
  days: number;
  note: string;
  active: boolean;
}

export const DEFAULT_PLANS: Plan[] = [
  { id: "3m", name: "3 Month", priceInr: 2500, days: 90, note: "", active: true },
  { id: "6m", name: "6 Month", priceInr: 4000, days: 180, note: "Save 20%", active: true },
  { id: "1y", name: "1 Year", priceInr: 7000, days: 365, note: "Save 30%", active: true },
];

export const MAX_PLANS = 6;

export function parsePlans(raw: string | null | undefined): Plan[] {
  if (!raw) return DEFAULT_PLANS;
  try {
    const arr = JSON.parse(raw) as Partial<Plan>[];
    const plans = arr
      .filter((p) => p && typeof p.name === "string" && p.name.trim() && Number(p.priceInr) > 0)
      .map((p, i) => ({
        id: p.id ?? `p${i + 1}`,
        name: String(p.name).trim().slice(0, 40),
        priceInr: Math.round(Number(p.priceInr)),
        days: Math.max(1, Math.round(Number(p.days) || 30)),
        note: String(p.note ?? "").slice(0, 80),
        active: p.active !== false,
      }));
    return plans.length ? plans : DEFAULT_PLANS;
  } catch {
    return DEFAULT_PLANS;
  }
}

/** What the admin saved (or sensible defaults). Secret keys are never read from here: only environment variables hold them. */
export async function getPaymentSettings() {
  let row: Awaited<ReturnType<typeof prisma.paymentSettings.findUnique>> = null;
  try {
    row = await prisma.paymentSettings.findUnique({ where: { id: "default" } });
  } catch {
    /* table not reachable: defaults */
  }
  return {
    provider: row?.provider ?? "razorpay",
    enabled: row?.enabled ?? false,
    mode: (row?.mode === "live" ? "live" : "test") as "test" | "live",
    keyId: row?.keyId ?? process.env.RAZORPAY_KEY_ID?.trim() ?? "",
    currency: row?.currency ?? "INR",
    plans: parsePlans(row?.plans),
    saved: !!row,
  };
}

export function paymentEnvStatus() {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const webhook = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  return {
    hasSecret: secret.length > 0,
    secretValid: secret.length > 0 && !/[^\x20-\x7E]/.test(secret),
    hasWebhookSecret: webhook.length > 0,
  };
}
