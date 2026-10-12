import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import PropertyCard from "@/components/PropertyCard";
import { toPropertyCardData } from "@/lib/queries/listProperties";

export const metadata: Metadata = { title: "Saved Properties", description: "Your saved bank auction properties.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SavedPropertiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/saved-properties");
  const saved = await prisma.savedProperty.findMany({
    where: { userId: user.id, property: { status: "PUBLISHED" } },
    orderBy: { savedAt: "desc" },
    take: 100,
    include: { property: { include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 }, media: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } } } },
  });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12">
      <h1 className="text-2xl font-semibold text-brand mb-1">Saved properties</h1>
      <p className="text-sm text-brand-muted mb-6">Properties you saved with the ♡ Save button.</p>
      {saved.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-2xl p-8 text-center max-w-md">
          <p className="text-sm text-brand-muted mb-3">You have not saved any property yet.</p>
          <Link href="/properties" className="text-brand text-sm font-medium hover:underline">Browse listings →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {saved.map((s) => <PropertyCard key={s.propertyId} property={toPropertyCardData(s.property)} />)}
        </div>
      )}
    </main>
  );
}
