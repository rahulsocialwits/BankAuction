"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { createResetToken } from "@/lib/auth/resetToken";
import { mailConfigured, sendMail } from "@/lib/mail";
import { SITE_URL } from "@/lib/seo";

/**
 * "Forgot password". The answer is always the same, whether or not the email has an account (no way to find out who is registered).
 *  - With email set up (RESEND_API_KEY + MAIL_FROM): the account owner gets a one-hour reset link.
 *  - Without it: the request is saved as a lead named "Password reset request" and the master admin sends a reset link from
 *    Admin -> Registered Users.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && /^\S+@\S+\.\S+$/.test(email) && email.length < 200) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      let sent = false;
      if (mailConfigured()) {
        const token = createResetToken(user.id, user.passwordHash, 60);
        sent = await sendMail(
          email,
          "Reset your BankAuction.co password",
          `Hello${user.name ? ` ${user.name}` : ""},\n\nUse this link to choose a new password. It works once and expires in one hour:\n${SITE_URL}/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not ask for this, ignore this email: your password stays the same.`,
        );
      }
      if (!sent) await prisma.lead.create({ data: { name: "Password reset request", email, message: "A user asked to reset the password. Admin: Registered Users -> Reset link." } });
    }
  }
  redirect("/forgot-password?sent=1");
}
