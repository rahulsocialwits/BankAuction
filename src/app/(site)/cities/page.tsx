import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const groups = await prisma.property.groupBy({
    by: ["addressText"],
    where: { status: "PUBLISHED", addressText: { not: null } },
    _count: true,
  });

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by Location</h1>
      <p className="text-brand-muted text-sm mb-6">
        Locations as given by each source. We haven&apos;t geocoded these into formal city/state records yet, so this
        is a raw list of what auctions reported.
      </p>

      {groups.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published listings with a location yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {groups.map((g) => (
            <Link
              key={g.addressText}
              href={`/city/${slugify(g.addressText!)}`}
              className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors"
            >
              <div className="font-semibold">{g.addressText}</div>
              <div className="text-xs text-brand-muted mt-1">{g._count} listing(s)</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
