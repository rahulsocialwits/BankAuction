import { prisma } from "@/lib/db/prisma";
import { validCoordinates } from "./coordinates";

/*
 * CITY-LEVEL coordinates for the map. The bank notices give an address, not a map point, so for a property whose city is known
 * (geoCity + geoState, see the import and the location check) the centre of that city is looked up ONCE per city and stored in the
 * `cities` table (latitude / longitude). Every property of that city without coordinates then gets that point, and the property
 * attribute `coord_quality = city_centroid` says it is approximate. An exact point from a source (a map link in a notice) is never
 * overwritten: only properties with no coordinates at all are filled.
 *
 * Source of the lookup: OpenStreetMap Nominatim (https://operations.osmfoundation.org/policies/nominatim/): one request per second at
 * most, an identifying user agent, results cached (a city is looked up once; a city that cannot be found is remembered with empty
 * coordinates and not asked again). Pins are checked to lie inside India and the state name in the answer must match.
 */

const UA = "BankAuctionBot/1.0 (+https://auction.bizsocio.com; contact info@bankauction.co)";
const GAP_MS = 1_100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Centroid {
  lat: number;
  lng: number;
}

/** One Nominatim lookup. null = not found / not trustworthy. */
export async function lookupCity(city: string, state: string, fetchFn: typeof fetch = fetch): Promise<Centroid | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=in&addressdetails=1&q=${encodeURIComponent(`${city}, ${state}, India`)}`;
  const res = await fetchFn(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; address?: { state?: string } }[];
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
  for (const r of rows) {
    const st = r.address?.state ? norm(r.address.state) : "";
    if (st && !st.includes(norm(state)) && !norm(state).includes(st)) continue; // same city name in another state
    const c = validCoordinates(Number(r.lat), Number(r.lon));
    if (c) return { lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 };
  }
  return null;
}

/** Gives every published property that has a city but no coordinates the centre of its city. Returns what was done. */
export async function fillCityCoordinates(opts: { maxCities?: number; budgetMs?: number; onLog?: (l: string) => void } = {}): Promise<{ cities: number; resolved: number; unresolved: number; propertiesUpdated: number; pending: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  const say = opts.onLog ?? (() => undefined);
  const out = { cities: 0, resolved: 0, unresolved: 0, propertiesUpdated: 0, pending: 0 };
  const pairs = await prisma.$queryRaw<{ city: string; state: string; n: bigint }[]>`
    select "geoCity" as city, "geoState" as state, count(*)::bigint as n
    from properties
    where status = 'PUBLISHED' and latitude is null and "geoCity" is not null and "geoState" is not null
    group by 1, 2 order by n desc limit 4000`;
  out.pending = pairs.length;
  let lookups = 0;
  for (const p of pairs) {
    if (Date.now() > deadline) break;
    const slug = `${slugify(p.city)}-${slugify(p.state)}`;
    let row = await prisma.city.findUnique({ where: { slug }, select: { id: true, latitude: true, longitude: true } });
    if (!row) {
      if (lookups >= (opts.maxCities ?? 40)) continue;
      lookups++;
      let found: Centroid | null = null;
      try {
        found = await lookupCity(p.city, p.state);
      } catch (e) {
        say(`lookup failed for ${p.city}, ${p.state}: ${e instanceof Error ? e.message : e}`);
        break; // a provider problem: stop, try again on the next run (nothing is remembered)
      }
      const state = await prisma.state.upsert({ where: { slug: slugify(p.state) }, update: {}, create: { name: p.state, slug: slugify(p.state) } });
      row = await prisma.city.create({ data: { name: p.city, slug, stateId: state.id, latitude: found?.lat ?? null, longitude: found?.lng ?? null }, select: { id: true, latitude: true, longitude: true } });
      out.cities++;
      if (found) out.resolved++; else out.unresolved++;
      say(`${p.city}, ${p.state}: ${found ? `${found.lat}, ${found.lng}` : "not found"}`);
      await sleep(GAP_MS);
    }
    if (row.latitude === null || row.longitude === null) continue; // remembered as not found
    const ids = (await prisma.property.findMany({ where: { geoCity: p.city, geoState: p.state, latitude: null, longitude: null }, select: { id: true } })).map((x) => x.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await prisma.property.updateMany({ where: { id: { in: chunk }, latitude: null }, data: { latitude: row.latitude, longitude: row.longitude, cityId: row.id } });
      await prisma.propertyAttribute.createMany({ data: chunk.map((propertyId) => ({ propertyId, key: "coord_quality", value: "city_centroid" })), skipDuplicates: true });
    }
    out.propertiesUpdated += ids.length;
  }
  return out;
}
