import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { clip } from "@/lib/seo";
import { titleCase } from "@/lib/pipeline/locations";
import PropertyCard from "@/components/PropertyCard";
import { toPropertyCardData } from "@/lib/queries/listProperties";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const groups = await prisma.property.groupBy({ by: ["addressText"], where: { status: "PUBLISHED", addressText: { not: null } }, _count: { _all: true } });
  const match = groups.find((g) => slugify(g.addressText!) === slug);
  if (!match) return { title: "City not found", robots: { index: false } };
  const city = titleCase(match.addressText!);
  const n = match._count._all;
  const title = `Bank Auction Properties in ${city}`;
  const description = clip(`${n} bank auction propert${n === 1 ? "y" : "ies"} in ${city}: flats, houses, plots and commercial assets with reserve prices, EMD and auction dates.`, 158);
  return { title, description, alternates: { canonical: `/city/${slug}` }, openGraph: { title, description } };
}

export default async function CityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const groups = await prisma.property.groupBy({
    by: ["addressText"],
    where: { status: "PUBLISHED", addressText: { not: null } },
  });
  const match = groups.find((g) => slugify(g.addressText!) === slug);
  if (!match) notFound();

  const properties = await prisma.property.findMany({
    where: { status: "PUBLISHED", addressText: match.addressText },
    orderBy: { createdAt: "desc" },
    take: 48,
    include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">{match.addressText}</h1>
      <p className="text-brand-muted text-sm mb-6">{properties.length} published listing(s)</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {properties.map((p) => (
          <PropertyCard key={p.id} property={toPropertyCardData(p)} />
        ))}
      </div>
    </main>
  );
}
