import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";
import { canonCity } from "@/lib/pipeline/locations";
import { getCityCounts } from "./cities";

export type LocalityMap = Record<string, string[]>;

/**
 * City -> areas for the filters. Priority cities first, then every city that has a published listing, with the
 * areas the AI verified for those listings (plus any areas an admin added by hand under Locations).
 */
export const getLocalityMap = unstable_cache(
  async (): Promise<LocalityMap> => {
    const [adminRows, geoRows, cities] = await Promise.all([
      prisma.locality.findMany({ where: { active: true }, orderBy: [{ city: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
      prisma.property.groupBy({
        by: ["geoCity", "geoLocality"],
        where: { status: "PUBLISHED", geoCity: { not: null }, geoLocality: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { geoLocality: "desc" } },
      }),
      getCityCounts(),
    ]);

    const map: LocalityMap = {};
    const spelling = new Map<string, string>(); // canonical lowercase -> key in map
    const key = (city: string) => {
      const c = canonCity(city);
      const have = spelling.get(c.toLowerCase());
      if (have) return have;
      spelling.set(c.toLowerCase(), c);
      map[c] = [];
      return c;
    };

    for (const c of PRIORITY_CITIES) key(c);
    for (const c of cities) key(c.city);

    const add = (city: string, area: string) => {
      const k = key(city);
      if (!map[k].some((a) => a.toLowerCase() === area.toLowerCase())) map[k].push(area);
    };
    for (const r of adminRows) add(r.city, r.name);
    for (const g of geoRows) add(g.geoCity!, g.geoLocality!);
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.localeCompare(b));
    return map;
  },
  ["locality-map-v3"],
  { revalidate: 300, tags: ["localities"] },
);
