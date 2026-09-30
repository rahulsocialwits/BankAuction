import type { Metadata } from "next";
import Link from "next/link";
import { registerUser } from "./actions";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free BankAuction.co account to send enquiries and save properties.",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-brand-bg px-5 py-14">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Register free</h1>
        <p className="text-sm text-brand-muted mb-6">Create a free account to send enquiries on listings.</p>

        {error === "exists" && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">An account with that email already exists.</div>
        )}
        {error === "invalid" && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">Please fill all fields — password needs at least 6 characters.</div>
        )}

        <form action={registerUser} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input name="name" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input name="password" type="password" required minLength={6} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">
            Create Account
          </button>
        </form>

        <p className="text-xs text-brand-muted text-center mt-5">
          Already have an account?{" "}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
