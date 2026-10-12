import { prisma } from "@/lib/db/prisma";
import { publishedWhere, type PropertyFilters } from "@/lib/queries/publishedWhere";
import { MAP_PIN_CAP, toMapPins, type MapPinRow } from "@/lib/map/mapPins";

/** Map pins for the same filters as the list (publishedWhere), light rows only, capped. Read-only. */
export async function listMapPins(filters: PropertyFilters, cap = MAP_PIN_CAP) {
  const rows = await prisma.property.findMany({
    where: { AND: [publishedWhere(filters), { latitude: { not: null }, longitude: { not: null } }] },
    select: {
      id: true, slug: true, title: true, geoCity: true, latitude: true, longitude: true,
      attributes: { where: { key: "coord_quality" }, select: { value: true }, take: 1 },
      auctions: { orderBy: { createdAt: "desc" }, take: 1, select: { reservePrice: true } },
    },
    orderBy: { id: "asc" },
    take: cap + 1,
  });
  const capped = rows.length > cap;
  const mapped: MapPinRow[] = rows.slice(0, cap).map((r) => ({
    id: r.id, slug: r.slug, title: r.title, geoCity: r.geoCity, latitude: r.latitude, longitude: r.longitude,
    coordQuality: r.attributes[0]?.value ?? null,
    reservePrice: r.auctions[0]?.reservePrice != null ? Number(r.auctions[0].reservePrice) : null,
  }));
  return { ...toMapPins(mapped), capped };
}
