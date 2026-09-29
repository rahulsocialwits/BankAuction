"use server";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSessionValue, USER_COOKIE_MAX_AGE, USER_COOKIE_NAME } from "@/lib/auth/userSession";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginUser(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(USER_COOKIE_NAME, createUserSessionValue(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: USER_COOKIE_MAX_AGE,
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_COOKIE_NAME);
  redirect("/");
}
