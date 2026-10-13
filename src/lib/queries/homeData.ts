import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { activeAuctionWhere } from "@/lib/domain/auctionLifecycle";
import { toPropertyCardData } from "@/lib/queries/listProperties";
import type { PropertyCardData } from "@/components/PropertyCard";
import type { CountdownRow } from "@/components/AuctionCountdownTable";

/*
 * Everything the home page needs from the database, in ONE cached call (10 minutes). The home page used to run 14 queries on every
 * visit; on the server they queue behind each other (one database connection per function), which made the page take about 8 seconds.
 * The cache stores plain JSON only: dates are ISO strings and prices are numbers.
 */

const COUNTDOWN_CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURAL", "LAND_PLOT", null] as const;

export interface HomeData {
  activeListings: number;
  banksCovered: number;
  upcomingAuctions: number;
  typeCounts: { category: string | null; n: number }[];
  topBanks: { slug: string; name: string; auctions: number }[];
  featured: PropertyCardData[];
  countdownRows: CountdownRow[];
}

export const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    const [activeListings, banksCovered, upcomingAuctions, featured, topBanks, countdown, typeGroups] = await Promise.all([
      prisma.property.count({ where: { status: "PUBLISHED" } }),
      prisma.bank.count({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } } }),
      prisma.auction.count({ where: { AND: [activeAuctionWhere()], property: { status: "PUBLISHED" } } }),
      prisma.property.findMany({
        where: { status: "PUBLISHED", auctions: { some: { AND: [activeAuctionWhere()] } } },
        orderBy: [{ media: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
        take: 12,
        include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 }, media: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } },
      }),
      prisma.bank.findMany({
        select: { slug: true, name: true, _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
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
      prisma.property.groupBy({ by: ["category"], where: { status: "PUBLISHED" }, _count: { _all: true } }),
    ]);

    // One row per property (soonest auction): a property can have several auction events, which would read as duplicates.
    const seen = new Set<string>();
    const countdownRows: CountdownRow[] = [];
    for (const a of countdown) {
      if (seen.has(a.propertyId)) continue;
      seen.add(a.propertyId);
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

    return {
      activeListings,
      banksCovered,
      upcomingAuctions,
      typeCounts: typeGroups.map((g) => ({ category: g.category, n: g._count._all })),
      topBanks: topBanks.map((b) => ({ slug: b.slug, name: b.name, auctions: b._count.auctions })),
      featured: featured.map((p) => {
        const c = toPropertyCardData(p);
        return { ...c, reservePrice: c.reservePrice === null ? null : Number(c.reservePrice), auctionStart: c.auctionStart ? c.auctionStart.toISOString() : null };
      }),
      countdownRows,
    };
  },
  ["home-data-v1"],
  { revalidate: 600, tags: ["home"] } // counts and lists move slowly: a refresh every 10 minutes keeps most visits on the cached copy,
);
