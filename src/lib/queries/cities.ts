import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";
import { buildCitySummary, citySlug, type CityCount, type CitySummary } from "@/lib/domain/cityCounts";
import { publishedWhere } from "@/lib/queries/listProperties";

export { citySlug };
export type { CityCount, CitySummary };

/**
 * Per-city counts for the homepage cards and the city pages. The definition lives in domain/cityCounts.ts and is the same one the
 * results page uses: the filters below ARE publishedWhere (the shared where-clause), so a card's number is the length of the list
 * behind it. Cached for 5 minutes; the cache key changed when the definition changed, so no count from the old definition
 * (all published listings, source-city fallback) can be served.
 */
export const getCitySummary = unstable_cache(
  async (): Promise<CitySummary> => {
    const activeWhere = publishedWhere({ statusGroup: "active" });
    const [activeGroups, allGroups, activeTotal] = await Promise.all([
      prisma.property.groupBy({ by: ["geoCity"], where: { AND: [activeWhere, { geoCity: { not: null } }] }, _count: { _all: true } }),
      prisma.property.groupBy({ by: ["geoCity"], where: { status: "PUBLISHED", geoCity: { not: null } }, _count: { _all: true } }),
      prisma.property.count({ where: activeWhere }),
    ]);
    const rows = (gs: typeof activeGroups) => gs.map((g) => ({ geoCity: g.geoCity, n: g._count._all }));
    return buildCitySummary(rows(activeGroups), rows(allGroups), activeTotal, PRIORITY_CITIES);
  },
  ["city-summary-v2"],
  { revalidate: 300, tags: ["localities"] },
);

export async function getCityCounts(): Promise<CityCount[]> {
  return (await getCitySummary()).cities;
}
