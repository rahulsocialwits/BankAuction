import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "My Alerts",
  description: "Your bank auction alerts.",
  robots: { index: false, follow: false },
};

export default function MyAlertsPage() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-5">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold mb-2">Alerts need an account</h1>
        <p className="text-sm text-brand-muted mb-4">User accounts aren&apos;t live yet, so auction alerts aren&apos;t available.</p>
        <Link href="/auctions" className="text-brand text-sm font-medium hover:underline">Browse auctions →</Link>
      </div>
    </main>
  );
}
