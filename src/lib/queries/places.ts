import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { canonCity, titleCase } from "@/lib/pipeline/locations";
import { PRIORITY_CITIES } from "@/lib/constants";

const STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha",
  "telangana state": "Telangana",
  "andhra pradesh state": "Andhra Pradesh",
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
};

/** One spelling per Indian state ("Orissa" -> "Odisha"). */
export function canonState(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return STATE_ALIASES[k] ?? titleCase(k);
}

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
    const rows = await prisma.property.groupBy({
      by: ["geoState", "geoCity", "geoLocality"],
      where: { status: "PUBLISHED", geoCity: { not: null } },
      _count: { _all: true },
    });

    const states = new Map<string, number>();
    const cities = new Map<string, { city: string; state: string | null; count: number }>();
    const areas = new Map<string, { city: string; area: string }>();
    for (const r of rows) {
      const city = canonCity(r.geoCity!);
      const state = r.geoState ? canonState(r.geoState) : null;
      const n = r._count._all;
      if (state) states.set(state, (states.get(state) ?? 0) + n);
      const c = cities.get(city) ?? { city, state, count: 0 };
      c.count += n;
      c.state ??= state;
      cities.set(city, c);
      if (r.geoLocality) areas.set(`${city}|${r.geoLocality.toLowerCase()}`, { city, area: r.geoLocality });
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
