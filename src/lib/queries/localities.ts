import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";

export type LocalityMap = Record<string, string[]>;

export const getLocalityMap = unstable_cache(
  async (): Promise<LocalityMap> => {
    const rows = await prisma.locality.findMany({
      where: { active: true },
      orderBy: [{ city: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    const map: LocalityMap = {};
    for (const c of PRIORITY_CITIES) map[c] = [];
    for (const r of rows) (map[r.city] ??= []).push(r.name);
    return map;
  },
  ["locality-map"],
  { revalidate: 300, tags: ["localities"] }
);
