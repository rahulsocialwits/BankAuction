import type { Metadata } from "next";
import PropertyCard from "@/components/PropertyCard";
import PropertyFilterForm from "@/components/PropertyFilterForm";
import { listPublishedProperties, toPropertyCardData, StatusGroup } from "@/lib/queries/listProperties";
import { getLocalityMap } from "@/lib/queries/localities";
import { prisma } from "@/lib/db/prisma";
import { PropertyCategory } from "@prisma/client";

export const revalidate = 120;

const CATEGORIES: { label: string; value: PropertyCategory }[] = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

type SP = { category?: string; q?: string; bank?: string; city?: string; locality?: string; status?: string; priceMin?: string; priceMax?: string };

function placeLabel(sp: SP) {
  if (sp.locality && sp.city) return `${sp.locality}, ${sp.city}`;
  return sp.city ?? sp.locality ?? "";
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const place = placeLabel(sp);
  return {
    title: place ? `Bank Auction Properties in ${place}` : "Bank Auction Properties in India",
    description: place
      ? `Browse live and upcoming bank auction properties in ${place} — SARFAESI, e-auction and distressed assets with reserve prices and auction dates.`
      : "Browse live and upcoming bank auction properties across India — residential, commercial, industrial, land and vehicles.",
  };
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { category, q, bank, city, locality, status, priceMin, priceMax } = sp;
  const validCategory = CATEGORIES.find((c) => c.value === category)?.value;
  const statusGroup: StatusGroup = status === "completed" || status === "all" ? status : "active";

  const [properties, banks, localities] = await Promise.all([
    listPublishedProperties(
      {
        category: validCategory,
        keyword: q || undefined,
        city: city || undefined,
        locality: locality || undefined,
        statusGroup,
        bankId: bank || undefined,
        priceMin: priceMin ? Number(priceMin) : undefined,
        priceMax: priceMax ? Number(priceMax) : undefined,
      },
      48
    ),
    prisma.bank.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getLocalityMap(),
  ]);

  const place = placeLabel(sp);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-1">
        {place ? `Bank Auction Properties in ${place}` : "Bank Auction Properties"}
      </h1>
      <p className="text-brand-muted text-sm mb-6">{properties.length} listing(s) found</p>

      <PropertyFilterForm
        localities={localities}
        banks={banks}
        categories={CATEGORIES}
        initial={{ q, city, locality, category: validCategory, bank, status: statusGroup, priceMin, priceMax }}
      />

      {properties.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-border rounded-2xl bg-white">
          <p className="font-medium text-brand mb-1">No listings match these filters</p>
          <p className="text-sm text-brand-muted">Try a different area, or widen the status to &quot;All&quot;.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={toPropertyCardData(p)} />
          ))}
        </div>
      )}
    </main>
  );
}
