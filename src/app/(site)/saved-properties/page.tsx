import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Saved Properties",
  description: "Your saved bank auction properties.",
  robots: { index: false, follow: false },
};

export default function SavedPropertiesPage() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-5">
      <div className="bg-white border border-brand-border rounded-2xl p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold mb-2">Saved properties needs an account</h1>
        <p className="text-sm text-brand-muted mb-4">User accounts aren&apos;t live yet, so saving isn&apos;t available.</p>
        <Link href="/properties" className="text-brand text-sm font-medium hover:underline">Browse listings →</Link>
      </div>
    </main>
  );
}
