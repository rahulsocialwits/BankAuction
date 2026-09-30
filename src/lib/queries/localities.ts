import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";
import { canonCity } from "@/lib/pipeline/locations";

export type LocalityMap = Record<string, string[]>;

/**
 * City -> areas for the filters. Priority cities first, then admin/auto-added areas, then every city that has
 * at least one published listing (so a new city appears as soon as its first property is fetched).
 */
export const getLocalityMap = unstable_cache(
  async (): Promise<LocalityMap> => {
    const [rows, cityGroups] = await Promise.all([
      prisma.locality.findMany({ where: { active: true }, orderBy: [{ city: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
      prisma.property.groupBy({
        by: ["addressText"],
        where: { status: "PUBLISHED", addressText: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { addressText: "desc" } },
        take: 300,
      }),
    ]);
    const map: LocalityMap = {};
    for (const c of PRIORITY_CITIES) map[c] = [];
    for (const r of rows) (map[r.city] ??= []).push(r.name);

    const present = new Set(Object.keys(map).map((c) => canonCity(c).toLowerCase()));
    for (const g of cityGroups) {
      if (!g.addressText || g.addressText.length > 40) continue;
      const city = canonCity(g.addressText);
      if (present.has(city.toLowerCase())) continue;
      present.add(city.toLowerCase());
      map[city] = [];
    }
    return map;
  },
  ["locality-map-v2"],
  { revalidate: 300, tags: ["localities"] },
);
