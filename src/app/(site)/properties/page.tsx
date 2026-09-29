import PropertyCard from "@/components/PropertyCard";
import { listPublishedProperties, toPropertyCardData } from "@/lib/queries/listProperties";
import { PropertyCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

const CATEGORIES: { label: string; value: PropertyCategory }[] = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const validCategory = CATEGORIES.find((c) => c.value === category)?.value;

  const properties = await listPublishedProperties({ category: validCategory, keyword: q || undefined }, 48);

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-2xl font-semibold mb-1">Bank Auction Properties</h1>
      <p className="text-brand-muted text-sm mb-6">{properties.length} listing(s) found</p>

      <form className="flex flex-wrap gap-3 mb-6" action="/properties">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by title, location, bank..."
          className="flex-1 min-w-[220px] border border-brand-border rounded-lg px-3 py-2 text-sm"
        />
        <select name="category" defaultValue={validCategory ?? ""} className="border border-brand-border rounded-lg px-3 py-2 text-sm">
          <option value="">All property types</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-brand text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-brand-dark">
          Search
        </button>
      </form>

      {properties.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published listings match these filters yet.</p>
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
