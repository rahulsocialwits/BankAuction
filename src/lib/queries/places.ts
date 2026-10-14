import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { canonCity, titleCase } from "@/lib/pipeline/locations";
import { PRIORITY_CITIES } from "@/lib/constants";
import { canonState } from "@/lib/domain/states";

export { canonState };

export interface PlaceData {
  states: { name: string; count: number }[];
  cities: { city: string; state: string | null; count: number }[];
  areas: { city: string; area: string }[];
}

/**
 * Everything the search boxes and filters need: states, cities (with their state) and areas, taken from the
 * AI-verified place of every published listing, most listings first.
 */
export const getPlaces = unstable_cache(
  async (): Promise<PlaceData> => {
    // One aggregate query (about 10,000 groups) instead of reading every published property (35,000+ rows with a join): the old version
    // took 10+ seconds on the server whenever the 5-minute cache had to be rebuilt.
    const groups = await prisma.property.groupBy({
      by: ["geoState", "geoCity", "geoLocality", "cityId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    });
    const cityIds = [...new Set(groups.filter((g) => !g.geoCity && g.cityId).map((g) => g.cityId as string))];
    const fallback = new Map(
      (cityIds.length ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true, state: { select: { name: true } } } }) : []).map((c) => [c.id, c]),
    );

    const states = new Map<string, number>();
    const cities = new Map<string, { city: string; state: string | null; count: number }>();
    const areas = new Map<string, { city: string; area: string }>();
    for (const g of groups) {
      const fb = g.cityId ? fallback.get(g.cityId) : undefined;
      const city = canonCity(g.geoCity ?? fb?.name ?? "");
      if (!city) continue;
      const state = g.geoState ? canonState(g.geoState) : fb?.state?.name ? canonState(fb.state.name) : null;
      const n = g._count._all;
      if (state) states.set(state, (states.get(state) ?? 0) + n);
      // One entry per (city, state): the same city name can exist in two states (Aurangabad in Maharashtra and in Bihar are different places).
      const key = `${city}|${state ?? ""}`;
      const c = cities.get(key) ?? { city, state, count: 0 };
      c.count += n;
      cities.set(key, c);
      if (g.geoLocality) areas.set(`${city}|${g.geoLocality.toLowerCase()}`, { city, area: g.geoLocality });
    }

    const priority = new Map(PRIORITY_CITIES.map((c, i) => [canonCity(c), i]));
    return {
      states: [...states.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      cities: [...cities.values()].sort((a, b) => {
        const pa = priority.get(a.city) ?? 999;
        const pb = priority.get(b.city) ?? 999;
        return pa !== pb ? pa - pb : b.count - a.count || a.city.localeCompare(b.city);
      }),
      areas: [...areas.values()].sort((a, b) => a.area.localeCompare(b.area)),
    };
  },
  ["places-v1"],
  { revalidate: 300, tags: ["localities"] },
);
