import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PropertyCategory } from "@prisma/client";

export const revalidate = 120;

const CATEGORIES: { label: string; value: PropertyCategory; description: string }[] = [
  { label: "Residential", value: "RESIDENTIAL", description: "Flats, houses, villas, residential plots" },
  { label: "Commercial", value: "COMMERCIAL", description: "Shops, offices, showrooms, commercial buildings" },
  { label: "Industrial", value: "INDUSTRIAL", description: "Factories, warehouses, plant & machinery" },
  { label: "Land & Plot", value: "LAND_PLOT", description: "Residential, commercial and open plots" },
  { label: "Agricultural", value: "AGRICULTURAL", description: "Farmland, orchards, agricultural buildings" },
  { label: "Vehicles", value: "VEHICLE", description: "Cars, commercial vehicles, heavy machinery" },
];

export default async function PropertyTypesPage() {
  const counts = await prisma.property.groupBy({
    by: ["category"],
    where: { status: "PUBLISHED" },
    _count: true,
  });
  const countMap = new Map(counts.map((c) => [c.category, c._count]));

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by Property Type</h1>
      <p className="text-brand-muted text-sm mb-6">Explore auctions across residential, commercial, industrial, land, agricultural and vehicle categories.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/property-type/${c.value.toLowerCase()}`}
            className="bg-white border border-brand-border rounded-xl p-5 hover:border-brand transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{c.label}</div>
              <span className="text-xs text-brand-muted">{countMap.get(c.value) ?? 0} listings</span>
            </div>
            <p className="text-sm text-brand-muted">{c.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
