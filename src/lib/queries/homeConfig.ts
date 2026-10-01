import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TILE_CITIES, IMAGE_TAG } from "@/lib/siteImages";

export const DEFAULT_HERO_TITLE = "Find Bank Auction Properties With Confidence";
export const DEFAULT_HERO_SUBTITLE = "Residential, commercial, industrial, agricultural and land auctions from banks across India, kept up to date automatically.";

export const getHomeConfig = unstable_cache(
  async () => {
    let row: Awaited<ReturnType<typeof prisma.homeConfig.findUnique>> = null;
    try {
      row = await prisma.homeConfig.findUnique({ where: { id: "default" } });
    } catch {
      /* defaults */
    }
    let cities = DEFAULT_TILE_CITIES;
    try {
      const parsed = row?.cities ? (JSON.parse(row.cities) as string[]) : null;
      if (parsed && parsed.length >= 4) cities = parsed.slice(0, 8);
    } catch {
      /* defaults */
    }
    return {
      heroTitle: row?.heroTitle || DEFAULT_HERO_TITLE,
      heroSubtitle: row?.heroSubtitle || DEFAULT_HERO_SUBTITLE,
      cities,
    };
  },
  ["home-config"],
  { revalidate: 300, tags: [IMAGE_TAG] },
);
