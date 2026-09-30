import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/** Home-page meta description written from live numbers, so it never goes stale. Cached for 10 minutes. */
export const getAutoHomeDescription = unstable_cache(
  async (): Promise<string> => {
    try {
      const [listings, banks, cities, upcoming] = await Promise.all([
        prisma.property.count({ where: { status: "PUBLISHED" } }),
        prisma.bank.count({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } } }),
        prisma.property.groupBy({ by: ["addressText"], where: { status: "PUBLISHED", addressText: { not: null } } }).then((g) => g.length),
        prisma.auction.count({ where: { status: { in: ["UPCOMING", "LIVE", "AUCTION_TODAY"] }, property: { status: "PUBLISHED" } } }),
      ]);
      if (listings === 0) return "Discover bank auction properties across India: flats, houses, plots and commercial assets with reserve prices and auction dates.";
      return (
        `Browse ${listings.toLocaleString("en-IN")} bank auction properties from ${banks} banks across ${cities} cities in India` +
        `${upcoming ? `, including ${upcoming.toLocaleString("en-IN")} upcoming auctions` : ""}. ` +
        `Flats, houses, plots and commercial assets with reserve price, EMD and auction date.`
      );
    } catch {
      return "Discover bank auction properties across India: flats, houses, plots and commercial assets with reserve prices and auction dates.";
    }
  },
  ["auto-home-description"],
  { revalidate: 600 },
);
