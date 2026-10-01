import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TILE_CITIES, IMAGE_TAG, PROPERTY_TYPE_TILES } from "@/lib/siteImages";

export const DEFAULT_HERO_TITLE = "Find Bank Auction Properties With Confidence";
export const DEFAULT_HERO_SUBTITLE = "Residential, commercial, industrial, agricultural and land auctions from banks across India, kept up to date automatically.";

/** Property types in the saved order; any type missing from the saved list goes to the end, so none can vanish. */
export function orderTypes(saved: string[] | null) {
  const byValue = new Map<string, (typeof PROPERTY_TYPE_TILES)[number]>(PROPERTY_TYPE_TILES.map((t) => [t.value, t]));
  const out: (typeof PROPERTY_TYPE_TILES)[number][] = [];
  for (const v of saved ?? []) {
    const t = byValue.get(v);
    if (t && !out.includes(t)) out.push(t);
  }
  for (const t of PROPERTY_TYPE_TILES) if (!out.includes(t)) out.push(t);
  return out;
}

export const getHomeConfig = unstable_cache(
  async () => {
    let row: Awaited<ReturnType<typeof prisma.homeConfig.findUnique>> = null;
    try {
      row = await prisma.homeConfig.findUnique({ where: { id: "default" } });
    } catch {
      /* defaults */
    }
    const parse = (s: string | null | undefined): string[] | null => {
      try {
        const v = s ? (JSON.parse(s) as unknown) : null;
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
      } catch {
        return null;
      }
    };
    const savedCities = parse(row?.cities);
    return {
      heroTitle: row?.heroTitle || DEFAULT_HERO_TITLE,
      heroSubtitle: row?.heroSubtitle || DEFAULT_HERO_SUBTITLE,
      cities: savedCities && savedCities.length >= 4 ? savedCities.slice(0, 8) : DEFAULT_TILE_CITIES,
      types: orderTypes(parse(row?.typeOrder)),
    };
  },
  ["home-config-v2"],
  { revalidate: 300, tags: [IMAGE_TAG] },
);
