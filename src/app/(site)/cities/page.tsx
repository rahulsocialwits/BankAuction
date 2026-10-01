import type { Metadata } from "next";
import Link from "next/link";
import { getCityCounts } from "@/lib/queries/cities";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Bank Auction Properties by City",
  description: "Find bank auction properties by city across India: Mumbai, Delhi, Pune, Bangalore, Hyderabad and more, with reserve prices and auction dates.",
  alternates: { canonical: "/cities" },
};

export default async function CitiesPage() {
  const cities = await getCityCounts();

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by Location</h1>
      <p className="text-brand-muted text-sm mb-6">Every city with live bank auction properties, most listings first.</p>

      {cities.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published listings with a location yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {cities.map((c) => (
            <Link key={c.slug} href={`/city/${c.slug}`} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors">
              <div className="font-semibold">{c.city}</div>
              <div className="text-xs text-brand-muted mt-1">{c.count} listing{c.count === 1 ? "" : "s"}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
