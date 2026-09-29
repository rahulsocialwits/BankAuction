import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import PropertyCard from "@/components/PropertyCard";
import { toPropertyCardData } from "@/lib/queries/listProperties";

export const revalidate = 120;

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
    <main className="max-w-6xl mx-auto px-5 py-10">
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
