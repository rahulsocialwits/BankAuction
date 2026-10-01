import { loginAdmin } from "./actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-brand-bg px-5">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand mb-1">Admin sign in</h1>
        <p className="text-sm text-brand-muted mb-6">BankAuction.co internal review dashboard</p>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
            Incorrect email or password. Try again.
          </div>
        )}

        <form action={loginAdmin} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email <span className="text-brand-muted font-normal">(leave blank to sign in with the owner password)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
