import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
  const description = clip(`${n} bank auction propert${n === 1 ? "y" : "ies"} in ${match.city}: flats, houses, plots and commercial assets with reserve prices, EMD and auction dates.`, 158);
  return { title, description, alternates: { canonical: `/city/${slug}` }, openGraph: { title, description } };
}

export default async function CityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const match = await findCity(slug);
  if (!match) notFound();

  // Same AI-verified city filter as the Properties page, so the two always agree.
  const properties = await listPublishedProperties({ city: match.city, statusGroup: "all" }, 48);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">{match.city}</h1>
      <p className="text-brand-muted text-sm mb-6">{match.count} published listing{match.count === 1 ? "" : "s"}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {properties.map((p) => (
          <PropertyCard key={p.id} property={toPropertyCardData(p)} />
        ))}
      </div>
    </main>
  );
}
