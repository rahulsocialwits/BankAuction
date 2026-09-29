"use server";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createUserSessionValue, USER_COOKIE_MAX_AGE, USER_COOKIE_NAME } from "@/lib/auth/userSession";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function registerUser(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!name || !email || password.length < 6) {
    redirect(`/register?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect(`/register?error=exists&next=${encodeURIComponent(next)}`);
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });

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
