"use server";

import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getCurrentUser } from "@/lib/auth/userSession";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/settings");

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) redirect("/account/settings?error=invalid_name");

  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/account");
  redirect("/account/settings?saved=1");
}

export async function changePassword(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/settings");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next_pw") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!verifyPassword(current, user.passwordHash)) redirect("/account/settings?error=wrong_password");
  if (next.length < 8) redirect("/account/settings?error=too_short");
  if (next !== confirm) redirect("/account/settings?error=mismatch");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
  redirect("/account/settings?saved=1");
}

export async function requestDeletion(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  // Record a deletion request via audit log (soft signal; actual deletion requires owner action).
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorEmail: user.email,
      action: "user.deletion_request",
      entityType: "User",
      entityId: user.id,
      note: reason || null,
    },
  });
  redirect("/account/settings?deleted_request=1");
}

export async function updateConsent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const marketing = formData.get("marketing") === "1";
  await prisma.user.update({
    where: { id: user.id },
    data: { marketingConsent: marketing, consentUpdatedAt: new Date() },
  });
  revalidatePath("/account/settings");
  redirect("/account/settings?saved=1");
}
