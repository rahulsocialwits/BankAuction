"use server";

import { requireMaster } from "@/lib/auth/adminAuth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

export async function createAdmin(formData: FormData) {
  await requireMaster();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) redirect("/admin/admins?error=email");
  if (password.length < 8) redirect("/admin/admins?error=password");

  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) redirect("/admin/admins?error=exists");

  const role = formData.get("role") === "MASTER" ? "MASTER" : "ADMIN";
  await prisma.adminUser.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  revalidatePath("/admin/admins");
  redirect("/admin/admins?created=1");
}

export async function toggleAdmin(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id") ?? "");
  const admin = await prisma.adminUser.findUnique({ where: { id } });
  if (!admin) return;
  await prisma.adminUser.update({ where: { id }, data: { active: !admin.active } });
  revalidatePath("/admin/admins");
}

export async function deleteAdmin(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id") ?? "");
  await prisma.adminUser.deleteMany({ where: { id } });
  revalidatePath("/admin/admins");
}
