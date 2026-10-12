import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { resetTokenUserId, verifyResetToken } from "@/lib/auth/resetToken";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  short: "The password must have at least 8 characters.",
  mismatch: "The two passwords are not the same.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  const userId = resetTokenUserId(token);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }) : null;
  const valid = !!user && verifyResetToken(token, user.passwordHash);

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-brand-bg px-5 py-14">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Choose a new password</h1>
        {!valid ? (
          <>
            <p className="text-sm text-brand-muted mt-3 mb-5">This link has expired or was already used. Ask for a new one.</p>
            <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">Send me a new link →</Link>
          </>
        ) : (
          <form action={resetPassword} className="space-y-4 mt-4">
            <input type="hidden" name="token" value={token} />
            {error && MESSAGES[error] && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{MESSAGES[error]}</div>}
            <div>
              <label className="block text-sm font-medium mb-1">New password</label>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Repeat the password</label>
              <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">Save new password</button>
          </form>
        )}
      </div>
    </main>
  );
}
