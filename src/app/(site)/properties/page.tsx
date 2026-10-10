import type { Metadata } from "next";
import Link from "next/link";
import PropertyCard from "@/components/PropertyCard";
import PropertyFilterForm from "@/components/PropertyFilterForm";
import { listMapPins } from "@/lib/queries/mapPins";
import { pinSummary } from "@/lib/map/mapPins";
import PropertyMapView from "@/components/PropertyMapView";
import ViewToggle from "@/components/ViewToggle";
import { parseView } from "@/lib/map/coordinates";
import { listPublishedProperties, countPublishedProperties, toPropertyCardData, StatusGroup, type PropertyFilters } from "@/lib/queries/listProperties";
import { getLocalityMap } from "@/lib/queries/localities";
import { getPlaces } from "@/lib/queries/places";
import { prisma } from "@/lib/db/prisma";
import { PropertyCategory } from "@prisma/client";

export const revalidate = 120;

const CATEGORIES: { label: string; value: PropertyCategory }[] = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
];

type SP = { category?: string; q?: string; keyword?: string; bank?: string; state?: string; city?: string; locality?: string; status?: string; priceMin?: string; priceMax?: string; page?: string; view?: string };

function placeLabel(sp: SP) {
  if (sp.locality && sp.city) return `${sp.locality}, ${sp.city}`;
  return sp.city ?? sp.locality ?? sp.state ?? "";
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const place = placeLabel(sp);
  const cat = CATEGORIES.find((c) => c.value === sp.category)?.label;
  const bank = sp.bank ? await prisma.bank.findUnique({ where: { id: sp.bank }, select: { name: true } }).catch(() => null) : null;

  const what = `${cat ? `${cat} ` : ""}Bank Auction Properties`;
  const title = `${what}${place ? ` in ${place}` : " in India"}${bank ? ` – ${bank.name}` : ""}`;
  const description =
    `Browse live and upcoming ${cat ? cat.toLowerCase() + " " : ""}bank auction properties${place ? ` in ${place}` : " across India"}` +
    `${bank ? ` from ${bank.name}` : ""} — SARFAESI and e-auction assets with reserve prices, EMD and auction dates.`;
  return {
    title,
    description,
    alternates: { canonical: "/properties" },
    openGraph: { title, description },
    // Filtered views are useful to visitors but should not compete with the main listing in search.
    robots: sp.q || sp.keyword || sp.priceMin || sp.priceMax ? { index: false, follow: true } : undefined,
  };
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? sp.keyword)?.trim() || undefined;
  const { category, bank, state, city, locality, status, priceMin, priceMax } = sp;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const PAGE_SIZE = 48;
  const view = parseView(sp.view);
  const validCategory = CATEGORIES.find((c) => c.value === category)?.value;
  const statusGroup: StatusGroup = status === "completed" || status === "active" ? status : "all";

  const filters: PropertyFilters = { category: validCategory, keyword: q || undefined, state: state || undefined, city: city || undefined, locality: locality || undefined, statusGroup, bankId: bank || undefined, priceMin: priceMin ? Number(priceMin) : undefined, priceMax: priceMax ? Number(priceMax) : undefined };
  const [properties, totalCount, banks, localities, places] = await Promise.all([
    listPublishedProperties(
      {
        category: validCategory,
        keyword: q || undefined,
        state: state || undefined,
        city: city || undefined,
        locality: locality || undefined,
        statusGroup,
        bankId: bank || undefined,
        priceMin: priceMin ? Number(priceMin) : undefined,
        priceMax: priceMax ? Number(priceMax) : undefined,
      },
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
    countPublishedProperties(filters),
    prisma.bank.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getLocalityMap(),
    getPlaces(),
  ]);

  // Map view: pins for EVERY listing matching the filters (not just this page), same where-clause as the list.
  const mapData = view === "map" ? await listMapPins(filters) : { pins: [], withoutLocation: 0, capped: false };
  const place = placeLabel(sp);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-1">
        {place ? `Bank Auction Properties in ${place}` : "Bank Auction Properties"}
      </h1>
      <p className="text-brand-muted text-sm mb-6">Showing {totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString("en-IN")} listing(s)</p>

      <PropertyFilterForm
        localities={localities}
        places={places}
        banks={banks}
        categories={CATEGORIES}
        initial={{ q, state, city, locality, category: validCategory, bank, status: statusGroup, priceMin, priceMax, view }}
      />

      <div className="flex items-center justify-between gap-3 mb-5">
        <ViewToggle params={{ category, q, bank, state, city, locality, status: statusGroup, priceMin, priceMax, page: sp.page }} view={view} />
      </div>

      {properties.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-border rounded-2xl bg-white">
          <p className="font-medium text-brand mb-1">No listings match these filters</p>
          <p className="text-sm text-brand-muted">Try a different area, or widen the status to &quot;All&quot;.</p>
        </div>
      ) : view === "map" ? (
        <PropertyMapView
          pins={mapData.pins}
          summary={pinSummary(totalCount, mapData.pins.length, mapData.pins.filter((p) => p.approximate).length, mapData.capped)}
          items={properties.map((p) => ({ id: p.id, slug: p.slug, title: p.title, point: null, card: <PropertyCard property={toPropertyCardData(p)} /> }))}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={toPropertyCardData(p)} />
          ))}
        </div>
      )}

      {totalCount > PAGE_SIZE && (() => {
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ category, q, bank, state, city, locality, status: statusGroup, priceMin, priceMax, view: view === "map" ? "map" : undefined })) {
          if (value) params.set(key, value);
        }
        return (
          <nav aria-label="Property pages" className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (() => { const prev = new URLSearchParams(params); prev.set("page", String(page - 1)); return <Link href={"/properties?" + prev.toString()} className="px-4 py-2 rounded-lg border border-brand-border text-sm font-medium hover:border-brand">← Previous</Link>; })()}
            <span className="px-4 py-2 text-sm text-brand-muted">Page {page} of {totalPages}</span>
            {page < totalPages && (() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); return <Link href={"/properties?" + next.toString()} className="px-4 py-2 rounded-lg border border-brand-border text-sm font-medium hover:border-brand">Next →</Link>; })()}
          </nav>
        );
      })()}
    </main>
  );
}
