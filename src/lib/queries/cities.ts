import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";
import { canonCity } from "@/lib/pipeline/locations";

export interface CityCount {
  city: string;
  slug: string;
  count: number;
}

export const citySlug = (city: string) => city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Cities with published listings, most listings first (priority cities lead). The city is the AI-verified one
 * where available, otherwise the source's own location text, spelled one way.
 */
export const getCityCounts = unstable_cache(
  async (): Promise<CityCount[]> => {
    const rows = await prisma.property.findMany({
      where: { status: "PUBLISHED" },
      select: { geoCity: true, addressText: true, geoCheckedAt: true },
      take: 20000,
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const raw = r.geoCity ?? (r.geoCheckedAt ? null : r.addressText);
      if (!raw || raw.length > 40) continue;
      const city = canonCity(raw);
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    const all = [...counts.entries()].map(([city, count]) => ({ city, slug: citySlug(city), count }));
    const priority = new Map(PRIORITY_CITIES.map((c, i) => [canonCity(c), i]));
    return all.sort((a, b) => {
      const pa = priority.get(a.city) ?? 999;
      const pb = priority.get(b.city) ?? 999;
      return pa !== pb ? pa - pb : b.count - a.count || a.city.localeCompare(b.city);
    });
  },
  ["city-counts"],
  { revalidate: 300, tags: ["localities"] },
);
