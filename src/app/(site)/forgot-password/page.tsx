import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-brand-bg px-5 py-14">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Forgot your password?</h1>
        {sent ? (
          <>
            <p className="text-sm text-brand-muted mt-3 mb-5">If an account exists for that email, we will send you a link to choose a new password. It can take a few minutes. If nothing arrives, contact us from the Contact page.</p>
            <Link href="/login" className="text-sm font-medium text-brand hover:underline">← Back to sign in</Link>
          </>
        ) : (
          <>
            <p className="text-sm text-brand-muted mb-6">Enter the email of your account and we will help you set a new password.</p>
            <form action={requestPasswordReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input name="email" type="email" required autoComplete="email" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">Send reset link</button>
            </form>
            <p className="text-sm text-brand-muted mt-4"><Link href="/login" className="text-brand hover:underline">Back to sign in</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
