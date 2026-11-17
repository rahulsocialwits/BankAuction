import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/userSession";
import { updateProfile, changePassword, requestDeletion, updateConsent } from "../actions";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { type: "ok" | "err"; text: string }> = {
  saved: { type: "ok", text: "Changes saved." },
  deleted_request: { type: "ok", text: "Your deletion request has been recorded. Our team will process it within 30 days." },
  invalid_name: { type: "err", text: "Name must be between 1 and 80 characters." },
  wrong_password: { type: "err", text: "Current password is incorrect." },
  too_short: { type: "err", text: "New password must be at least 8 characters." },
  mismatch: { type: "err", text: "Passwords do not match." },
};

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; deleted_request?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/settings");
  const sp = await searchParams;
  const msgKey = sp.saved ? "saved" : sp.deleted_request ? "deleted_request" : sp.error ?? undefined;
  const msg = msgKey ? MESSAGES[msgKey] : null;

  const field = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand";
  const label = "block text-sm font-medium mb-1";

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12 max-w-2xl mx-auto">
      <nav className="text-xs text-brand-muted mb-4 flex items-center gap-1.5">
        <a href="/account" className="hover:text-brand">My account</a>
        <span>/</span>
        <span className="text-brand">Settings</span>
      </nav>
      <h1 className="text-2xl font-semibold text-brand mb-6">Account settings</h1>

      {msg && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-100"}`}>
          {msg.text}
        </div>
      )}

      {/* Profile */}
      <section className="bg-white border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <form action={updateProfile} className="space-y-4">
          <div>
            <label className={label}>Display name</label>
            <input name="name" type="text" defaultValue={user.name ?? ""} required maxLength={80} className={field} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input type="email" value={user.email} disabled className={`${field} opacity-60 cursor-not-allowed`} />
            <p className="text-xs text-brand-muted mt-1">Email cannot be changed. Contact us if needed.</p>
          </div>
          <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Save name</button>
        </form>
      </section>

      {/* Password */}
      <section className="bg-white border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Change password</h2>
        <form action={changePassword} className="space-y-4">
          <div>
            <label className={label}>Current password</label>
            <input name="current" type="password" required className={field} />
          </div>
          <div>
            <label className={label}>New password</label>
            <input name="next_pw" type="password" required minLength={8} className={field} />
          </div>
          <div>
            <label className={label}>Confirm new password</label>
            <input name="confirm" type="password" required minLength={8} className={field} />
          </div>
          <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Change password</button>
        </form>
      </section>

      {/* Consent */}
      <section className="bg-white border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Communication preferences</h2>
        <form action={updateConsent} className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="hidden" name="marketing" value="0" />
            <input name="marketing" type="checkbox" value="1" defaultChecked={user.marketingConsent} className="mt-0.5 h-4 w-4 rounded border-brand-border" />
            <span className="text-sm">I agree to receive emails about new auction listings and platform updates. You can unsubscribe at any time.</span>
          </label>
          {user.consentUpdatedAt && (
            <p className="text-xs text-brand-muted">Last updated: {user.consentUpdatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
          )}
          <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Save preferences</button>
        </form>
      </section>

      {/* Data deletion */}
      <section className="bg-white border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-2">Delete my account</h2>
        <p className="text-sm text-brand-muted mb-4">
          Submitting this form records a deletion request. Our team will delete your account and all personal data within 30 days and send a confirmation to {user.email}. This action cannot be undone.
        </p>
        <details className="border border-brand-border rounded-lg p-4">
          <summary className="text-sm font-medium text-red-600 cursor-pointer">Request account deletion</summary>
          <form action={requestDeletion} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-brand-muted mb-1">Reason (optional)</label>
              <textarea name="reason" rows={3} maxLength={500} placeholder="Why are you leaving?" className={`${field} resize-none`} />
            </div>
            <button type="submit" className="bg-red-600 text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-red-700">
              Submit deletion request
            </button>
          </form>
        </details>
      </section>
    </main>
  );
}
