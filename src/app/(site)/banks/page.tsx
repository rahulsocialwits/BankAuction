import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import BankDirectory from "@/components/BankDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Banks Conducting Auctions",
  description: "All banks and financial institutions with live and upcoming auction properties on BankAuction.co, with listing counts for each.",
  alternates: { canonical: "/banks" },
};

export default async function BanksPage() {
  const banks = await prisma.bank.findMany({
    include: { _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
    orderBy: { name: "asc" },
  });
  const withListings = banks.filter((b) => b._count.auctions > 0).map((b) => ({ id: b.id, name: b.name, slug: b.slug, count: b._count.auctions }));

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by Bank</h1>
      <p className="text-brand-muted text-sm mb-6">Banks and financial institutions with published auction listings.</p>

      {withListings.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No banks with published listings yet.</p>
      ) : (
        <BankDirectory banks={withListings} />
      )}
    </main>
  );
}
