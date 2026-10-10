import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import PropertyCarousel from "@/components/PropertyCarousel";
import { toPropertyCardData } from "@/lib/queries/listProperties";
import HeroSearch from "@/components/HeroSearch";
import ResponsiveImage from "@/components/ResponsiveImage";
import BlogCarousel from "@/components/BlogCarousel";
import DragScroll from "@/components/DragScroll";
import AuctionCountdownTable, { CountdownRow } from "@/components/AuctionCountdownTable";
import { getCityCounts, citySlug } from "@/lib/queries/cities";
import { getHomeConfig } from "@/lib/queries/homeConfig";
import { canonCity } from "@/lib/pipeline/locations";
import { activeAuctionWhere } from "@/lib/domain/auctionLifecycle";
import { bankKey, cityKey, getImageVersions, heroKey, imageUrl, typeKey } from "@/lib/siteImages";

export const revalidate = 120;

// "Other" tab = land & plots and anything without a category.
const COUNTDOWN_CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURAL", "LAND_PLOT", null] as const;

const WHY_CHOOSE = [
  { title: "Source-backed information", body: "Every figure and fact traces back to an official auction notice — nothing is invented." },
  { title: "Broad coverage", body: "Residential, commercial, industrial, agricultural and land auctions from banks across India." },
  { title: "Always up to date", body: "Listings refresh automatically, so prices, dates and statuses stay current." },
  { title: "Source information", body: "Explore property auction listings and available source information. Document availability varies by listing." },
];

export default async function Home() {
  const [activeListings, banksCovered, upcomingAuctions, featured, cityCounts, topBanks, countdownAuctions, config, versions, typeGroups] = await Promise.all([
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.bank.count({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } } }),
    prisma.auction.count({ where: { AND: [activeAuctionWhere()], property: { status: "PUBLISHED" } } }),
    prisma.property.findMany({
      where: { status: "PUBLISHED", auctions: { some: { AND: [activeAuctionWhere()] } } },
      orderBy: [{ media: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      take: 12,
      include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 }, media: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
    getCityCounts(),
    prisma.bank.findMany({
      include: { _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
      orderBy: { auctions: { _count: "desc" } },
      take: 10,
    }),
    // Eight per tab, fetched per tab: one busy category can never push the others out of the list.
    Promise.all(
      COUNTDOWN_CATEGORIES.map((category) =>
        prisma.auction.findMany({
          where: { AND: [activeAuctionWhere()], property: { status: "PUBLISHED", category } },
          orderBy: { auctionStart: "asc" },
          take: 24,
          include: { bank: true, property: true },
        }),
      ),
    ).then((lists) => lists.flat()),
    getHomeConfig(),
    getImageVersions(),
    prisma.property.groupBy({ by: ["category"], where: { status: "PUBLISHED" }, _count: { _all: true } }),
  ]);

  // Admin-chosen banks (in their order); with none chosen, the ten with the most listings.
  const chosen = config.banks.length
    ? await prisma.bank.findMany({ where: { slug: { in: config.banks } } })
    : [];
  const promoBanks = chosen.length
    ? config.banks.map((slug) => chosen.find((b) => b.slug === slug)).filter((b): b is (typeof chosen)[number] => !!b)
    : topBanks.filter((b) => b._count.auctions > 0);

  const stats = [
    { label: "Listings in Catalogue", value: activeListings },
    { label: "Banks Covered", value: banksCovered },
    { label: "Upcoming Auctions", value: upcomingAuctions },
  ];

  const countByCity = new Map(cityCounts.map((c) => [c.city, c.count]));
  // Keep admin-selected cities first, but fill empty slots with the highest-volume real cities.
  const homeCities = [...config.cities, ...cityCounts.map((c) => c.city)]
    .filter((name, i, all) => all.findIndex((x) => canonCity(x) === canonCity(name)) === i)
    .filter((name) => (countByCity.get(canonCity(name)) ?? 0) > 0)
    .slice(0, 8);
  const countByType = new Map(typeGroups.map((g) => [g.category, g._count._all]));

  // One row per property (soonest auction): a property can have several auction events, which would read as duplicates.
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
      location: a.property.geoLocality && a.property.geoCity ? `${a.property.geoLocality}, ${a.property.geoCity}` : (a.property.geoCity ?? a.property.addressText),
      category: a.property.category,
      auctionStart: a.auctionStart ? a.auctionStart.toISOString() : null,
    });
  }

  const heroDesktop = imageUrl(versions, heroKey("d"));
  const heroMobile = imageUrl(versions, heroKey("m"));
  const hasHeroImage = !!(heroDesktop || heroMobile);

  return (
    <main>
      {/* HERO: background pictures come from Admin → Home Page (1440×480 desktop, 1080×1350 mobile). */}
      <section className="relative z-20 bg-brand">
        {hasHeroImage ? (
          <>
            <ResponsiveImage desktop={heroDesktop} mobile={heroMobile} priority className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b md:bg-gradient-to-r from-brand/85 via-brand/55 to-brand/25" />
          </>
        ) : (
          <div
            className="absolute inset-0 -z-10 opacity-[0.07]"
            style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          />
        )}
        <div className="w-full px-5 lg:px-10 xl:px-16 py-14 md:py-16 min-h-[520px] md:min-h-[480px] flex flex-col justify-center">
          <span className="self-start text-[11px] font-semibold tracking-wide text-gold bg-white/10 backdrop-blur px-3 py-1 rounded-full mb-4">
            INDIA&apos;S BANK AUCTION DISCOVERY PLATFORM
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white max-w-3xl leading-tight">{config.heroTitle}</h1>
          <p className="text-white/80 mt-4 max-w-2xl text-sm sm:text-base">{config.heroSubtitle}</p>
          <div className="mt-8 max-w-5xl">
            <HeroSearch />
          </div>
        </div>
      </section>

      {/* Stat boxes are switched off for now (display: none). Remove "hidden" below to show them again. */}
      <div className="hidden w-full px-5 lg:px-10 xl:px-16 mt-6 grid-cols-3 gap-3 sm:gap-4 max-w-3xl">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-brand-border rounded-2xl py-4 text-center shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-brand">{s.value.toLocaleString("en-IN")}</div>
            <div className="text-[11px] sm:text-xs text-brand-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* EXPLORE BY CITY: 8 tiles, 2 rows of 4 on desktop (picture 221×148). */}
      <section className="w-full px-5 lg:px-10 xl:px-16 pt-14 pb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Explore by City</h2>
          <Link href="/cities" className="text-sm font-medium text-brand hover:underline">See All →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6 md:gap-x-6">
          {homeCities.map((name) => {
            const city = canonCity(name);
            const d = imageUrl(versions, cityKey(name, "d"));
            const m = imageUrl(versions, cityKey(name, "m"));
            const count = countByCity.get(city) ?? 0;
            return (
              <Link key={name} href={`/properties?city=${encodeURIComponent(city)}&status=active`} className="group block text-center">
                <div className="relative aspect-[221/148] rounded-2xl overflow-hidden bg-gradient-to-br from-brand to-brand-dark shadow-sm group-hover:shadow-lg transition-shadow">
                  {d || m ? (
                    <ResponsiveImage desktop={d} mobile={m} alt={name} className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/90 text-2xl font-semibold tracking-wide">{city}</div>
                  )}
                </div>
                <div className="mt-2.5 text-sm font-semibold text-black/90">{name}</div>
                <div className="text-xs text-brand-muted">{count} active propert{count === 1 ? "y" : "ies"}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ASSETS AVAILABLE: five property-type cards (picture 236×300); a swipeable row on mobile. */}
      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Assets Available</h2>
          <Link href="/property-types" className="text-sm font-medium text-brand hover:underline">All types →</Link>
        </div>
        <DragScroll className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-5 px-5 scroll-px-5 md:scroll-px-0 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:gap-5 md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {config.types.map((t) => {
            const d = imageUrl(versions, typeKey(t.value, "d"));
            const m = imageUrl(versions, typeKey(t.value, "m"));
            return (
              <Link
                key={t.value}
                href={`/properties?category=${t.value}&status=all`}
                className="group relative shrink-0 w-[62%] sm:w-[40%] md:w-auto snap-start aspect-[236/300] rounded-2xl overflow-hidden bg-gradient-to-br from-brand to-brand-dark shadow-sm hover:shadow-xl transition-shadow"
              >
                {(d || m) && <ResponsiveImage desktop={d} mobile={m} alt={t.label} className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute left-4 bottom-4 text-white">
                  <div className="text-3xl font-bold leading-none">{(countByType.get(t.value) ?? 0).toLocaleString("en-IN")}</div>
                  <div className="text-sm mt-1 text-white/90">{t.label}</div>
                </div>
              </Link>
            );
          })}
        </DragScroll>
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Featured Bank Auction Properties</h2>
          <Link href="/properties" className="text-sm text-brand font-medium">View all →</Link>
        </div>
        <PropertyCarousel properties={featured.map(toPropertyCardData)} />
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
        <h2 className="text-xl sm:text-2xl font-bold text-brand mb-5">Upcoming Auctions</h2>
        <AuctionCountdownTable rows={countdownRows} viewAllHref="/properties?status=active" />
      </section>

      {/* PROMOTER BANKS: 10 logos (224×80), 2 rows of 5; two swipeable rows on a phone. Chosen in Admin → Home Page. */}
      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-brand">Browse by Bank</h2>
          <Link href="/banks" className="text-sm text-brand font-medium">All banks →</Link>
        </div>
        {promoBanks.length === 0 ? (
          <p className="text-brand-muted text-sm">No banks with published listings yet.</p>
        ) : (
          <DragScroll className="grid grid-flow-col auto-cols-[44%] sm:auto-cols-[30%] gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-5 px-5 scroll-px-5 md:scroll-px-0 md:mx-0 md:px-0 md:pb-0 md:grid-flow-row md:grid-cols-5 md:auto-cols-auto md:gap-4 md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {promoBanks.map((b) => {
              const logo = imageUrl(versions, bankKey(b.slug));
              return (
                <Link key={b.id} href={`/bank/${b.slug}`} title={b.name} className="group snap-start flex aspect-[224/80] items-center justify-center overflow-hidden rounded-xl border border-brand-border bg-white p-2 hover:border-brand hover:shadow-md transition">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={b.name} loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <span className="px-1 text-center text-xs sm:text-sm font-semibold leading-tight text-brand line-clamp-2">{b.name}</span>
                  )}
                </Link>
              );
            })}
          </DragScroll>
        )}
      </section>

      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
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

      <section className="w-full px-5 lg:px-10 xl:px-16 py-10">
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
