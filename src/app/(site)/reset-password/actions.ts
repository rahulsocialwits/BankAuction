"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { resetTokenUserId, verifyResetToken } from "@/lib/auth/resetToken";
import { createUserSessionValue, USER_COOKIE_MAX_AGE, USER_COOKIE_NAME } from "@/lib/auth/userSession";

/** Sets the new password if the link is valid (not expired, not used before), then signs the user in. */
export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (error: string) => redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${error}`);

  const userId = resetTokenUserId(token);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user || !verifyResetToken(token, user.passwordHash)) redirect("/reset-password?error=expired");
  if (password.length < 8) back("short");
  if (password !== confirm) back("mismatch");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  const store = await cookies();
  store.set(USER_COOKIE_NAME, createUserSessionValue(user.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: USER_COOKIE_MAX_AGE });
  redirect("/account?reset=1");
}
