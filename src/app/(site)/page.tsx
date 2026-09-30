import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import PropertyCarousel from "@/components/PropertyCarousel";
import { toPropertyCardData } from "@/lib/queries/listProperties";
import SearchBar from "@/components/SearchBar";
import BlogCarousel from "@/components/BlogCarousel";
import AuctionCountdownTable, { CountdownRow } from "@/components/AuctionCountdownTable";
import { PRIORITY_CITIES } from "@/lib/constants";
import { getLocalityMap } from "@/lib/queries/localities";

export const revalidate = 120;

const PROPERTY_TYPES = [
  { label: "Residential", category: "RESIDENTIAL" },
  { label: "Commercial", category: "COMMERCIAL" },
  { label: "Industrial", category: "INDUSTRIAL" },
  { label: "Land & Plot", category: "LAND_PLOT" },
  { label: "Agricultural", category: "AGRICULTURAL" },
  { label: "Vehicles", category: "VEHICLE" },
];

const WHY_CHOOSE = [
  { title: "Source-backed information", body: "Every figure and fact traces back to an official auction notice — nothing is invented." },
  { title: "Broad coverage", body: "Residential, commercial, industrial, agricultural, land and vehicle auctions from banks across India." },
  { title: "Always up to date", body: "Listings refresh automatically, so prices, dates and statuses stay current." },
  { title: "Full documents", body: "Sale notices, bid forms and terms are linked directly on every listing." },
];

export default async function Home() {
  const [activeListings, banksCovered, upcomingAuctions, featured, cityGroups, topBanks, countdownAuctions, localityMap] = await Promise.all([
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.bank.count({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } } }),
    prisma.auction.count({ where: { status: { in: ["UPCOMING", "LIVE", "AUCTION_TODAY"] }, property: { status: "PUBLISHED" } } }),
    prisma.property.findMany({
      where: { status: "PUBLISHED", auctions: { some: { status: { in: ["UPCOMING", "LIVE", "AUCTION_TODAY"] } } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.property.groupBy({
      by: ["addressText"],
      where: { status: "PUBLISHED", addressText: { in: PRIORITY_CITIES } },
      _count: true,
    }),
    prisma.bank.findMany({
      include: { _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
      orderBy: { auctions: { _count: "desc" } },
      take: 6,
    }),
    prisma.auction.findMany({
      where: { status: { in: ["UPCOMING", "LIVE", "AUCTION_TODAY"] }, property: { status: "PUBLISHED" } },
      orderBy: { auctionStart: "asc" },
      take: 40,
      include: { bank: true, property: true },
    }),
    getLocalityMap(),
  ]);

  const stats = [
    { label: "Active Listings", value: activeListings },
    { label: "Banks Covered", value: banksCovered },
    { label: "Upcoming Auctions", value: upcomingAuctions },
  ];

  const cityCountMap = new Map(cityGroups.map((g) => [g.addressText, g._count]));
  // One row per property (soonest auction) -- a property can legitimately
  // have multiple auction events (re-listings), but listing each separately
  // here reads as a duplicate bug rather than useful information.
  const seenPropertyIds = new Set<string>();
  const countdownRows: CountdownRow[] = [];
  for (const a of countdownAuctions) {
    if (seenPropertyIds.has(a.propertyId)) continue;
    seenPropertyIds.add(a.propertyId);
    countdownRows.push({
      id: a.id,
      slug: a.property.slug,
      title: a.property.title,
      bankName: a.bank?.name ?? null,
      location: a.property.addressText,
      category: a.property.category,
      auctionStart: a.auctionStart ? a.auctionStart.toISOString() : null,
    });
  }

  return (
    <main>
      <section className="relative bg-brand overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative w-full px-5 lg:px-10 xl:px-16 pt-20 pb-16 text-center">
          <span className="inline-block text-xs font-semibold tracking-wide text-gold bg-white/10 px-3 py-1 rounded-full mb-5">
            INDIA&apos;S BANK AUCTION DISCOVERY PLATFORM
          </span>
          <h1 className="text-3xl sm:text-5xl font-bold text-white max-w-3xl mx-auto leading-tight">
            Find Bank Auction Properties With Confidence
          </h1>
          <p className="text-white/70 mt-4 max-w-xl mx-auto">
            Residential, commercial, industrial, agricultural and land auctions from banks across India —
            discovered, verified, and kept up to date automatically.
          </p>

          <div className="max-w-xl mx-auto mt-8">
            <SearchBar size="lg" />
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <Link href="/properties" className="bg-gold text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gold-dark">
              Explore Auctions
            </Link>
            <Link href="/how-it-works" className="border border-white/30 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-white/10">
              How It Works
            </Link>
          </div>
        </div>
      </section>

      <div className="relative max-w-4xl mx-auto px-5 -mt-10 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-brand-border rounded-2xl py-5 text-center shadow-sm">
            <div className="text-2xl font-bold text-brand">{s.value}</div>
            <div className="text-xs text-brand-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="w-full px-5 lg:px-10 xl:px-16 pt-14 pb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Featured Bank Auction Properties</h2>
          <Link href="/properties" className="text-sm text-brand font-medium">View all →</Link>
        </div>
        <PropertyCarousel properties={featured.map(toPropertyCardData)} />
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Upcoming Auctions</h2>
          <Link href="/auctions" className="text-sm text-brand font-medium">View all auctions →</Link>
        </div>
        <AuctionCountdownTable rows={countdownRows} />
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <h2 className="text-xl sm:text-2xl font-bold text-brand mb-5">Browse by Property Type</h2>
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

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Browse by Location</h2>
          <Link href="/cities" className="text-sm text-brand font-medium">All cities →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(localityMap).map(([city, areas]) => (
            <div key={city} className="bg-white border border-brand-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <Link href={`/properties?city=${encodeURIComponent(city)}`} className="font-semibold text-brand hover:underline">
                  {city}
                </Link>
                <span className="text-xs text-brand-muted">{cityCountMap.get(city) ?? 0} listings</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {areas.slice(0, 8).map((a) => (
                  <Link
                    key={a}
                    href={`/properties?city=${encodeURIComponent(city)}&locality=${encodeURIComponent(a)}`}
                    className="text-xs px-2.5 py-1 rounded-full bg-brand-bg text-black/70 hover:bg-brand hover:text-white transition-colors"
                  >
                    {a}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Browse by Bank</h2>
          <Link href="/banks" className="text-sm text-brand font-medium">All banks →</Link>
        </div>
        {topBanks.filter((b) => b._count.auctions > 0).length === 0 ? (
          <p className="text-brand-muted text-sm">No banks with published listings yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {topBanks.filter((b) => b._count.auctions > 0).map((b) => (
              <Link key={b.id} href={`/bank/${b.slug}`} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors">
                <div className="font-semibold text-sm">{b.name}</div>
                <div className="text-xs text-brand-muted mt-1">{b._count.auctions} listing(s)</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <h2 className="text-xl sm:text-2xl font-bold text-brand mb-5">Why Choose BankAuction.co?</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {WHY_CHOOSE.map((w) => (
            <div key={w.title} className="bg-white border border-brand-border rounded-xl p-5">
              <div className="font-semibold mb-1.5">{w.title}</div>
              <p className="text-sm text-brand-muted">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Bank Auction Insights</h2>
          <Link href="/blog" className="text-sm text-brand font-medium">View all →</Link>
        </div>
        <BlogCarousel />
      </section>

      <section className="bg-brand text-white">
        <div className="w-full px-5 lg:px-10 xl:px-16 py-14 text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to find your next property?</h2>
          <p className="text-white/80 mb-6">Search verified, source-backed bank auction listings across India.</p>
          <Link href="/properties" className="bg-gold text-white px-6 py-2.5 rounded-lg font-medium inline-block hover:bg-gold-dark">
            Explore Auctions
          </Link>
        </div>
      </section>
    </main>
  );
}
