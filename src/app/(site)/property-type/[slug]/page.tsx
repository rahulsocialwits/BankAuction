import PropertyCard from "@/components/PropertyCard";
import { listPublishedProperties, toPropertyCardData } from "@/lib/queries/listProperties";
import { PropertyCategory } from "@prisma/client";
import { notFound } from "next/navigation";

export const revalidate = 120;

const LABELS: Record<PropertyCategory, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
  LAND_PLOT: "Land & Plot",
  AGRICULTURAL: "Agricultural",
  VEHICLE: "Vehicles",
};

export default async function PropertyTypeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = slug.toUpperCase().replace(/-/g, "_") as PropertyCategory;
  if (!LABELS[category]) notFound();

  const properties = await listPublishedProperties({ category }, 48);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">{LABELS[category]} Auctions</h1>
      <p className="text-brand-muted text-sm mb-6">{properties.length} listing(s) found</p>

      {properties.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published {LABELS[category].toLowerCase()} listings yet.</p>
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
