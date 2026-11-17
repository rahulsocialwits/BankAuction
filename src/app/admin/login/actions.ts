"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_NAME, createAdminSessionValue, type AdminSession } from "@/lib/auth/adminSession";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/security/rateLimit";

export async function loginAdmin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = formData.get("password");
  const next = formData.get("next");
  const nextPath = typeof next === "string" && next.startsWith("/admin") ? next : "/admin";

  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit("admin-login", ip, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!allowed) redirect(`/admin/login?error=rate&next=${encodeURIComponent(nextPath)}`);

  let session: AdminSession | null = null;
  if (email && typeof password === "string" && password) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (admin && admin.active && verifyPassword(password, admin.passwordHash)) {
      session = { role: admin.role, adminId: admin.id };
    }
  }

  if (!session) redirect(`/admin/login?error=1&next=${encodeURIComponent(nextPath)}`);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, createAdminSessionValue(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });

  redirect(nextPath);
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect("/admin/login");
}
