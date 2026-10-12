"use server";

import { revalidatePath } from "next/cache";
import { requireMaster } from "@/lib/auth/adminAuth";
import { prisma } from "@/lib/db/prisma";
import { grantPremium, revokePremium } from "@/lib/payments/premium";

const ALLOWED_DAYS = [30, 90, 180, 365];

/** Master admin only: make a registered user Premium for 30/90/180/365 days. Recorded as a "paid" row of ₹0 from provider "admin". */
export async function makePremium(formData: FormData) {
  const admin = await requireMaster();
  const userId = String(formData.get("userId") ?? "");
  const days = Number(formData.get("days"));
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || !ALLOWED_DAYS.includes(days)) return;
  await grantPremium(user.email, days, admin.adminId ? `admin ${admin.adminId}` : "master admin");
  await prisma.payment.updateMany({ where: { email: user.email.toLowerCase(), status: "requested" }, data: { status: "granted" } }); // the request is answered
  revalidatePath("/admin/users");
}

/** Master admin only: back to a normal (free) user. Nothing is deleted; a "revoked" row ends the premium. */
export async function makeNormal(formData: FormData) {
  const admin = await requireMaster();
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  await revokePremium(user.email, admin.adminId ? `admin ${admin.adminId}` : "master admin");
  revalidatePath("/admin/users");
}
