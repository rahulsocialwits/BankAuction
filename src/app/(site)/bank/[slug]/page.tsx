import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { clip } from "@/lib/seo";
import PropertyCard from "@/components/PropertyCard";
import { toPropertyCardData } from "@/lib/queries/listProperties";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const bank = await prisma.bank.findUnique({ where: { slug }, select: { name: true } });
  if (!bank) return { title: "Bank not found", robots: { index: false } };
  const count = await prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { bank: { slug } } } } });
  const title = `${bank.name} Auction Properties`;
  const description = clip(`${count} ${bank.name} bank auction propert${count === 1 ? "y" : "ies"} with reserve prices, EMD and auction dates. Flats, houses, plots and commercial assets under SARFAESI.`, 158);
  return { title, description, alternates: { canonical: `/bank/${slug}` }, openGraph: { title, description } };
}

export default async function BankDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bank = await prisma.bank.findUnique({ where: { slug } });
  if (!bank) notFound();

  const properties = await prisma.property.findMany({
    where: { status: "PUBLISHED", auctions: { some: { bankId: bank.id } } },
    orderBy: { createdAt: "desc" },
    take: 48,
    include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">{bank.name}</h1>
      <p className="text-brand-muted text-sm mb-6">{properties.length} published listing(s)</p>

      {properties.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published listings from this bank yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={toPropertyCardData(p)} />
          ))}
        </div>
      )}
    </main>
  );
}
