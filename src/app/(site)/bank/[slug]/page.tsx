import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { clip, SITE_URL } from "@/lib/seo";
import PropertyCard from "@/components/PropertyCard";
import PagerNav from "@/components/PagerNav";
import JsonLd from "@/components/JsonLd";
import { listPublishedProperties, toPropertyCardData } from "@/lib/queries/listProperties";

export const revalidate = 120;

const PAGE_SIZE = 48;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const bank = await prisma.bank.findUnique({ where: { slug }, select: { name: true } });
  if (!bank) return { title: "Bank not found", robots: { index: false } };
  const count = await prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { bank: { slug } } } } });
  const title = `${bank.name} Auction Properties`;
  const description = clip(`${count} ${bank.name} bank auction propert${count === 1 ? "y" : "ies"} with reserve prices, EMD and auction dates. Flats, houses, plots and commercial assets under SARFAESI.`, 158);
  return { title, description, alternates: { canonical: `/bank/${slug}` }, openGraph: { title, description } };
}

export default async function BankDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const bank = await prisma.bank.findUnique({ where: { slug } });
  if (!bank) notFound();

  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const filters = { bankId: bank.id, statusGroup: "active" as const };
  const [properties, activeCount, totalCount] = await Promise.all([
    listPublishedProperties(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { bankId: bank.id } } } }),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { bankId: bank.id } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Banks", item: `${SITE_URL}/banks` },
      { "@type": "ListItem", position: 3, name: bank.name, item: `${SITE_URL}/bank/${slug}` },
    ],
  };

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <JsonLd data={breadcrumb} />
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/" className="hover:text-brand">Home</Link>
        {" / "}
        <Link href="/banks" className="hover:text-brand">Banks</Link>
        {" / "}
        <span>{bank.name}</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-1">{bank.name} Auction Properties</h1>
      <p className="text-brand-muted text-sm mb-5">
        {activeCount.toLocaleString("en-IN")} active listing{activeCount !== 1 ? "s" : ""}
        {totalCount > activeCount ? ` · ${totalCount.toLocaleString("en-IN")} total` : ""}
      </p>

      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <Link href={`/properties?bank=${bank.id}&status=active`} className="px-3 py-1.5 rounded-lg border bg-brand text-white border-brand font-medium">Active auctions</Link>
        <Link href={`/properties?bank=${bank.id}&status=all`} className="px-3 py-1.5 rounded-lg border border-brand-border text-brand-muted hover:border-brand">All (incl. ended)</Link>
      </div>

      {properties.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-border rounded-2xl">
          <p className="font-medium text-brand mb-1">No active listings from {bank.name} right now</p>
          <Link href={`/properties?bank=${bank.id}&status=all`} className="text-sm text-brand-muted hover:text-brand">
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

      <PagerNav basePath={`/bank/${slug}`} page={page} totalPages={totalPages} />
    </main>
  );
}
