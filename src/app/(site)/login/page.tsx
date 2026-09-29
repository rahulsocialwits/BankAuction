import Link from "next/link";
import { loginUser } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-brand-bg px-5 py-14">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-brand-muted mb-6">Log in to send enquiries and unlock full listing details.</p>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
            Incorrect email or password.
          </div>
        )}

        <form action={loginUser} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input name="password" type="password" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">
            Sign in
          </button>
        </form>

        <p className="text-xs text-brand-muted text-center mt-5">
          Don&apos;t have an account?{" "}
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand font-medium hover:underline">
            Register free
          </Link>
        </p>
      </div>
    </main>
  );
}
