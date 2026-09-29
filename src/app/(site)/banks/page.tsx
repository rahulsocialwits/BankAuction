import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function BanksPage() {
  const banks = await prisma.bank.findMany({
    include: { _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
    orderBy: { name: "asc" },
  });
  const withListings = banks.filter((b) => b._count.auctions > 0);

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by Bank</h1>
      <p className="text-brand-muted text-sm mb-6">Banks and financial institutions with published auction listings.</p>

      {withListings.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No banks with published listings yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {withListings.map((b) => (
            <Link key={b.id} href={`/bank/${b.slug}`} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors">
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs text-brand-muted mt-1">{b._count.auctions} listing(s)</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
