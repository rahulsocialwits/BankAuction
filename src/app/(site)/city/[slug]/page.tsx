import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { clip } from "@/lib/seo";
import PropertyCard from "@/components/PropertyCard";
import { listPublishedProperties, toPropertyCardData } from "@/lib/queries/listProperties";
import { getCityCounts } from "@/lib/queries/cities";

export const revalidate = 120;

async function findCity(slug: string) {
  return (await getCityCounts()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const match = await findCity(slug);
  if (!match) return { title: "City not found", robots: { index: false } };
  const n = match.count;
  const title = `Bank Auction Properties in ${match.city}`;
  const description = clip(
    n > 0
      ? `${n} active bank auction propert${n === 1 ? "y" : "ies"} in ${match.city}: flats, houses, plots and commercial assets with reserve prices, EMD and auction dates.`
      : `Bank auction properties in ${match.city}: flats, houses, plots and commercial assets with reserve prices, EMD and auction dates.`,
    158,
  );
  // Thin pages (fewer than 5 active listings) stay reachable for visitors but are kept out of search results.
  return { title, description, alternates: { canonical: `/city/${slug}` }, openGraph: { title, description }, robots: n < 5 ? { index: false, follow: true } : undefined };
}

const PAGE = 48;

export default async function CityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const match = await findCity(slug);
  if (!match) notFound();

  // The list IS the number above it: the same publishedWhere (verified city + Upcoming/Live/Auction Today) the homepage card counts.
  const properties = await listPublishedProperties({ city: match.city, statusGroup: "active" }, PAGE);
  const q = encodeURIComponent(match.city);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">{match.city}</h1>
      <p className="text-brand-muted text-sm mb-6">
        {match.count} active auction propert{match.count === 1 ? "y" : "ies"} (upcoming, live or today).{" "}
        <Link href={`/properties?city=${q}&status=all`} className="text-brand hover:underline">See all listings, including ended auctions</Link>
        {match.count > PAGE && (
          <>
            {" "}· Showing the newest {PAGE}.{" "}
            <Link href={`/properties?city=${q}&status=active`} className="text-brand hover:underline">See all {match.count}</Link>
          </>
        )}
      </p>

      {properties.length === 0 && <p className="text-brand-muted text-sm py-10 text-center">No active auctions in {match.city} right now.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {properties.map((p) => (
          <PropertyCard key={p.id} property={toPropertyCardData(p)} />
        ))}
      </div>
    </main>
  );
}
