"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_NAME, createAdminSessionValue } from "@/lib/auth/adminSession";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

export async function loginAdmin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = formData.get("password");
  const next = formData.get("next");
  const nextPath = typeof next === "string" && next.startsWith("/admin") ? next : "/admin";

  let ok = false;
  if (typeof password === "string" && password) {
    if (email) {
      const admin = await prisma.adminUser.findUnique({ where: { email } });
      ok = !!admin && admin.active && verifyPassword(password, admin.passwordHash);
    } else {
      ok = password === process.env.ADMIN_PASSWORD;
    }
  }

  if (!ok) redirect(`/admin/login?error=1&next=${encodeURIComponent(nextPath)}`);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, createAdminSessionValue(), {
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
