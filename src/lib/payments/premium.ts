import { prisma } from "@/lib/db/prisma";

/*
 * PREMIUM status of a user, worked out from the `payments` table (no schema change):
 *   - a row with status "paid" starts premium at paidAt and lasts `days` (stored in the row note as JSON {"days":90,"by":"razorpay"|"admin"});
 *   - a later row with status "revoked" (set by the master admin) or "refunded" ends it;
 *   - nothing is ever deleted: a grant, a purchase and a revoke are all rows, so the history stays.
 * A user is premium only while a paid row is in force. A purchase is recorded "paid" only after Razorpay's signature is verified
 * (verify route) or Razorpay's webhook says so; the browser alone can never make someone premium.
 */

export interface PaymentRow {
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  planId: string | null;
  note: string | null;
}

export interface PremiumState {
  premium: boolean;
  /** When the current premium ends (null when not premium). */
  until: Date | null;
  /** "razorpay" for a purchase, "admin" for a grant by the master admin. */
  source: "razorpay" | "admin" | null;
  planId: string | null;
}

export const NOT_PREMIUM: PremiumState = { premium: false, until: null, source: null, planId: null };
const DAY = 86_400_000;

export const paymentNote = (days: number, by: "razorpay" | "admin", extra: string = ""): string => JSON.stringify({ days, by, ...(extra ? { extra } : {}) });

function readNote(note: string | null): { days: number; by: "razorpay" | "admin" } | null {
  try {
    const j = JSON.parse(note ?? "") as { days?: unknown; by?: unknown };
    const days = Number(j.days);
    if (!Number.isFinite(days) || days <= 0) return null;
    return { days, by: j.by === "admin" ? "admin" : "razorpay" };
  } catch {
    return null;
  }
}

/** Pure: premium state at `now` from all payment rows of one user. */
export function computePremium(rows: PaymentRow[], now: Date = new Date()): PremiumState {
  const stops = rows.filter((r) => r.status === "revoked" || r.status === "refunded").map((r) => (r.paidAt ?? r.createdAt).getTime());
  let best: PremiumState = NOT_PREMIUM;
  for (const r of rows) {
    if (r.status !== "paid" || !r.paidAt) continue;
    const n = readNote(r.note);
    if (!n) continue;
    const start = r.paidAt.getTime();
    const until = start + n.days * DAY;
    if (until <= now.getTime()) continue; // ended
    if (stops.some((s) => s >= start)) continue; // revoked or refunded after it started
    if (!best.until || until > best.until.getTime()) best = { premium: true, until: new Date(until), source: n.by, planId: r.planId };
  }
  return best;
}

export async function getPremium(email: string | null | undefined): Promise<PremiumState> {
  if (!email) return NOT_PREMIUM;
  try {
    const rows = await prisma.payment.findMany({
      where: { email: email.toLowerCase(), status: { in: ["paid", "revoked", "refunded"] } },
      select: { status: true, createdAt: true, paidAt: true, planId: true, note: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return computePremium(rows);
  } catch {
    return NOT_PREMIUM;
  }
}

/** Master admin: premium for `days` days. A grant is a "paid" row of amount 0 from provider "admin". */
export async function grantPremium(email: string, days: number, adminName: string): Promise<void> {
  const now = new Date();
  await prisma.payment.create({
    data: { provider: "admin", email: email.toLowerCase(), planId: "admin", amount: 0, status: "paid", paidAt: now, note: paymentNote(days, "admin", `granted by ${adminName}`) },
  });
}

/** Master admin: back to normal. Ends every premium that started before now (purchases included); nothing is deleted. */
export async function revokePremium(email: string, adminName: string): Promise<void> {
  const now = new Date();
  await prisma.payment.create({
    data: { provider: "admin", email: email.toLowerCase(), planId: "admin", amount: 0, status: "revoked", paidAt: now, note: `revoked by ${adminName}` },
  });
}
