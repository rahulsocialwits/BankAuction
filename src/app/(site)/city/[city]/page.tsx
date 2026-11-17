import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import PropertyCard from "@/components/PropertyCard";
import PagerNav from "@/components/PagerNav";
import JsonLd from "@/components/JsonLd";
import { getCityCounts, citySlug } from "@/lib/queries/cities";
import { listPublishedProperties, toPropertyCardData } from "@/lib/queries/listProperties";
import { MIN_INDEXABLE_CITY_LISTINGS } from "@/lib/domain/cityCounts";
import { clip, SITE_URL } from "@/lib/seo";

export const revalidate = 300;

/** All the city slugs we'll generate static pages for. */
export async function generateStaticParams(): Promise<{ city: string }[]> {
  const counts = await getCityCounts();
  return counts.filter((c) => c.count >= MIN_INDEXABLE_CITY_LISTINGS).map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: slug } = await params;
  const counts = await getCityCounts();
  const match = counts.find((c) => c.slug === slug);
  if (!match) return { title: "City not found", robots: { index: false } };

  const noIndex = match.count < MIN_INDEXABLE_CITY_LISTINGS;
  const title = `Bank Auction Properties in ${match.city}`;
  const description = clip(
    `${match.count} active bank auction propert${match.count === 1 ? "y" : "ies"} in ${match.city} — residential, commercial, industrial and land. Reserve prices, EMD and auction dates from public bank notices.`,
    158,
  );
  return {
    title,
    description,
    alternates: { canonical: `/city/${slug}` },
    openGraph: { title, description },
    robots: noIndex ? { index: false, follow: true } : undefined,
  };
}

const PAGE_SIZE = 48;

export default async function CityPage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ city: slug }, sp] = await Promise.all([params, searchParams]);
  const counts = await getCityCounts();
  const match = counts.find((c) => c.slug === slug);
  if (!match) notFound();

  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const filters = { city: match.city, statusGroup: "active" as const };
  const [properties, total, banks] = await Promise.all([
    listPublishedProperties(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    prisma.property.count({ where: { status: "PUBLISHED", geoCity: match.city } }),
    prisma.bank
      .findMany({ where: { auctions: { some: { property: { status: "PUBLISHED", geoCity: match.city } } } }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })
      .catch(() => [] as { id: string; name: string; slug: string }[]),
  ]);
  const totalPages = Math.max(1, Math.ceil(match.count / PAGE_SIZE));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cities", item: `${SITE_URL}/cities` },
      { "@type": "ListItem", position: 3, name: match.city, item: `${SITE_URL}/city/${slug}` },
    ],
  };

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <JsonLd data={breadcrumb} />
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/" className="hover:text-brand">Home</Link>
        {" / "}
        <Link href="/cities" className="hover:text-brand">Cities</Link>
        {" / "}
        <span>{match.city}</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-1">
        Bank Auction Properties in {match.city}
      </h1>
      <p className="text-brand-muted text-sm mb-6">
        {match.count.toLocaleString("en-IN")} active listing{match.count !== 1 ? "s" : ""}
        {total > match.count ? ` · ${total.toLocaleString("en-IN")} total (including ended)` : ""}
      </p>

      {banks.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {banks.map((b) => (
            <Link
              key={b.id}
              href={`/properties?city=${encodeURIComponent(match.city)}&bank=${b.id}&status=active`}
              className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-muted hover:border-brand hover:text-brand"
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link href={`/properties?city=${encodeURIComponent(match.city)}&status=active`} className="px-3 py-1.5 rounded-lg border bg-brand text-white border-brand text-xs font-medium">Active</Link>
        <Link href={`/properties?city=${encodeURIComponent(match.city)}&status=all`} className="px-3 py-1.5 rounded-lg border border-brand-border text-brand-muted hover:border-brand text-xs">All (incl. ended)</Link>
        <Link href={`/properties?city=${encodeURIComponent(match.city)}&view=map`} className="px-3 py-1.5 rounded-lg border border-brand-border text-brand-muted hover:border-brand text-xs">Map view</Link>
      </div>

      {properties.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-border rounded-2xl">
          <p className="font-medium text-brand mb-1">No active listings in {match.city} right now</p>
          <Link href={`/properties?city=${encodeURIComponent(match.city)}&status=all`} className="text-sm text-brand-muted hover:text-brand">
            View all listings including ended auctions →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={toPropertyCardData(p)} />
          ))}
        </div>
      )}

      <PagerNav basePath={`/city/${slug}`} page={page} totalPages={totalPages} />
    </main>
  );
}
