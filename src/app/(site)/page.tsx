import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import PropertyCard from "@/components/PropertyCard";

export const dynamic = "force-dynamic";

const PROPERTY_TYPES = [
  { label: "Residential", category: "RESIDENTIAL" },
  { label: "Commercial", category: "COMMERCIAL" },
  { label: "Industrial", category: "INDUSTRIAL" },
  { label: "Land & Plot", category: "LAND_PLOT" },
  { label: "Agricultural", category: "AGRICULTURAL" },
  { label: "Vehicles", category: "VEHICLE" },
];

export default async function Home() {
  const [activeListings, banksCovered, upcomingAuctions, featured] = await Promise.all([
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.bank.count({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } } }),
    prisma.auction.count({ where: { status: { in: ["UPCOMING", "LIVE", "AUCTION_TODAY"] }, property: { status: "PUBLISHED" } } }),
    prisma.property.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  const stats = [
    { label: "Active Listings", value: activeListings },
    { label: "Banks Covered", value: banksCovered },
    { label: "Upcoming Auctions", value: upcomingAuctions },
  ];

  return (
    <main>
      <section className="bg-gradient-to-b from-brand-bg to-white">
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-black max-w-2xl mx-auto">
            Find Bank Auction Properties With Confidence
          </h1>
          <p className="text-brand-muted mt-4 max-w-xl mx-auto">
            Residential, commercial, industrial, agricultural and land auctions from banks across India —
            discovered, verified, and kept up to date automatically.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Link href="/properties" className="bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand-dark">
              Explore Auctions
            </Link>
            <Link href="/how-it-works" className="border border-brand-border px-6 py-2.5 rounded-lg font-medium hover:bg-brand-bg">
              How It Works
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-5 pb-14 grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white border border-brand-border rounded-2xl py-5 text-center">
              <div className="text-2xl font-bold text-brand">{s.value}</div>
              <div className="text-xs text-brand-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">Featured Bank Auction Properties</h2>
          <Link href="/properties" className="text-sm text-brand font-medium">View all →</Link>
        </div>
        {featured.length === 0 ? (
          <p className="text-brand-muted text-sm">
            No published listings yet — the ingestion pipeline hasn&apos;t run, or nothing has cleared review.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featured.map((p) => (
              <PropertyCard
                key={p.id}
                property={{
                  slug: p.slug,
                  title: p.title,
                  addressText: p.addressText,
                  category: p.category,
                  bankName: p.auctions[0]?.bank?.name ?? null,
                  reservePrice: p.auctions[0]?.reservePrice ?? null,
                  auctionStart: p.auctions[0]?.auctionStart ?? null,
                  status: p.auctions[0]?.status ?? null,
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="max-w-6xl mx-auto px-5 py-12">
        <h2 className="text-xl font-semibold mb-5">Browse by Property Type</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {PROPERTY_TYPES.map((t) => (
            <Link
              key={t.category}
              href={`/property-type/${t.category.toLowerCase()}`}
              className="bg-white border border-brand-border rounded-xl py-6 text-center text-sm font-medium hover:border-brand hover:text-brand transition-colors"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-brand text-white">
        <div className="max-w-6xl mx-auto px-5 py-14 text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to find your next property?</h2>
          <p className="text-white/80 mb-6">Search verified, source-backed bank auction listings across India.</p>
          <Link href="/properties" className="bg-white text-brand px-6 py-2.5 rounded-lg font-medium inline-block">
            Explore Auctions
          </Link>
        </div>
      </section>
    </main>
  );
}
