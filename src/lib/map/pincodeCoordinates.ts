import { prisma } from "@/lib/db/prisma";
import { validCoordinates } from "./coordinates";
import type { Centroid } from "./cityCoordinates";

/*
 * PIN-CODE level coordinates for the map. A listing's address from the bank notice is "City, District, State, PIN": there is no street
 * in it, so an exact point cannot be known. The centre of the PIN code area is far closer (about 1 to 3 km) than the centre of the
 * city, so a property that has a PIN gets that point instead of the city centre.
 *
 *   - the PIN is looked up ONCE at OpenStreetMap Nominatim (1 request per second, identifying user agent) and the answer is applied
 *     to every property with that PIN;
 *   - the answer is accepted only if it is inside India, in the same state as the property and (when the city centre is known)
 *     within about 65 km of the property's own city. Otherwise it is rejected: a mismatch is never silently placed somewhere else;
 *   - quality is recorded on the property as the attribute coord_quality: "pincode" (this module) or "city_centroid" (cityCoordinates.ts).
 *     A point taken from a notice (no coord_quality attribute) is never changed; a pincode point is never replaced by a city point;
 *   - a PIN that cannot be resolved is remembered with the attribute pin_geocode = "not_found:<pin>" and is not asked again;
 *   - nothing is deleted. It runs from the scheduler tick (few PINs per tick), so properties imported later are placed automatically.
 *     Set PIN_GEOCODE=off to stop it.
 */

const UA = "BankAuctionBot/1.0 (+https://auction.bizsocio.com; contact info@bankauction.co)";
const GAP_MS = 1_100;
const MAX_KM_FROM_CITY = 65;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
// The PIN pattern is passed to Postgres as a value (a word-bounded 6-digit number), not typed inside the SQL text.
const PIN_RE = String.raw`\m[1-9][0-9]{5}\M`;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** The 6-digit Indian PIN in an address (the last one), or null. */
export function extractPin(address: string | null | undefined): string | null {
  const all = (address ?? "").match(/(?<!\d)[1-9]\d{5}(?!\d)/g);
  return all ? all[all.length - 1] : null;
}

export function distanceKm(a: Centroid, b: Centroid): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export type PinLookup = { found: Centroid } | { rejected: string };

/** One Nominatim lookup of a PIN, checked against the property state and city centre. Throws on a provider error. */
export async function lookupPincode(pin: string, state: string, cityCentre: Centroid | null, fetchFn: typeof fetch = fetch): Promise<PinLookup> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&addressdetails=1&postalcode=${encodeURIComponent(pin)}`;
  const res = await fetchFn(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; address?: { state?: string } }[];
  if (rows.length === 0) return { rejected: "no answer for this PIN" };
  let why = "outside the state of the property";
  for (const r of rows) {
    const st = r.address?.state ? norm(r.address.state) : "";
    if (st && !st.includes(norm(state)) && !norm(state).includes(st)) continue;
    const c = validCoordinates(Number(r.lat), Number(r.lon));
    if (!c) { why = "not a valid point in India"; continue; }
    const point = { lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 };
    if (cityCentre && distanceKm(point, cityCentre) > MAX_KM_FROM_CITY) { why = `more than ${MAX_KM_FROM_CITY} km from the city of the property`; continue; }
    return { found: point };
  }
  return { rejected: why };
}

export interface PincodeRun { pinsTried: number; placed: number; rejected: number; propertiesUpdated: number; pending: number }

/**
 * Places published properties that have a PIN in their address at the centre of that PIN area (see above).
 * `dry`: looks up and reports, writes nothing. `city`: only that city (a safe first batch).
 */
export async function fillPincodeCoordinates(opts: { maxPins?: number; budgetMs?: number; city?: string; dry?: boolean; onLog?: (l: string) => void } = {}): Promise<PincodeRun> {
  const out: PincodeRun = { pinsTried: 0, placed: 0, rejected: 0, propertiesUpdated: 0, pending: 0 };
  if (process.env.PIN_GEOCODE === "off") return out;
  const deadline = Date.now() + (opts.budgetMs ?? 15_000);
  const say = opts.onLog ?? (() => undefined);
  const cityFilter = opts.city ?? null;
  const groups = await prisma.$queryRaw<{ pin: string; city: string; state: string; n: bigint }[]>`
    select substring(p."addressText" from ${PIN_RE}::text) as pin, p."geoCity" as city, p."geoState" as state, count(*)::bigint as n
    from properties p
    where p.status = 'PUBLISHED' and p."geoCity" is not null and p."geoState" is not null
      and p."addressText" ~ ${PIN_RE}::text
      and (${cityFilter}::text is null or p."geoCity" = ${cityFilter})
      and (p.latitude is null or exists (select 1 from property_attributes a where a."propertyId" = p.id and a.key = 'coord_quality' and a.value = 'city_centroid'))
      and not exists (select 1 from property_attributes a where a."propertyId" = p.id and a.key = 'pin_geocode')
    group by 1, 2, 3 order by n desc limit 3000`;
  out.pending = groups.length;
  for (const g of groups) {
    if (Date.now() > deadline || out.pinsTried >= (opts.maxPins ?? 8)) break;
    out.pinsTried++;
    const cityRow = await prisma.city.findUnique({ where: { slug: `${slugify(g.city)}-${slugify(g.state)}` }, select: { latitude: true, longitude: true } });
    const centre = cityRow?.latitude != null && cityRow.longitude != null ? { lat: cityRow.latitude, lng: cityRow.longitude } : null;
    let result: PinLookup;
    try {
      result = await lookupPincode(g.pin, g.state, centre);
    } catch (e) {
      say(`lookup failed for ${g.pin}: ${e instanceof Error ? e.message : e}`);
      break; // a provider problem: stop and try again on the next run (nothing is remembered)
    }
    const ids = (await prisma.$queryRaw<{ id: string }[]>`
      select p.id from properties p
      where p.status = 'PUBLISHED' and p."geoCity" = ${g.city} and p."geoState" = ${g.state} and substring(p."addressText" from ${PIN_RE}::text) = ${g.pin}
        and (p.latitude is null or exists (select 1 from property_attributes a where a."propertyId" = p.id and a.key = 'coord_quality' and a.value = 'city_centroid'))
        and not exists (select 1 from property_attributes a where a."propertyId" = p.id and a.key = 'pin_geocode')`).map((r) => r.id);
    const word = `propert${ids.length === 1 ? "y" : "ies"}`;
    if ("found" in result) {
      out.placed++;
      say(`${g.pin} (${g.city}): ${result.found.lat}, ${result.found.lng} -> ${ids.length} ${word}`);
      if (!opts.dry) {
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          await prisma.property.updateMany({ where: { id: { in: chunk } }, data: { latitude: result.found.lat, longitude: result.found.lng } });
          await prisma.propertyAttribute.updateMany({ where: { propertyId: { in: chunk }, key: "coord_quality" }, data: { value: "pincode" } });
          const have = new Set((await prisma.propertyAttribute.findMany({ where: { propertyId: { in: chunk }, key: "coord_quality" }, select: { propertyId: true } })).map((a) => a.propertyId));
          const missing = chunk.filter((id) => !have.has(id));
          if (missing.length) await prisma.propertyAttribute.createMany({ data: missing.map((propertyId) => ({ propertyId, key: "coord_quality", value: "pincode" })) });
        }
      }
      out.propertiesUpdated += ids.length;
    } else {
      out.rejected++;
      say(`${g.pin} (${g.city}): rejected, ${result.rejected} -> ${ids.length} ${word} keep their position`);
      if (!opts.dry) {
        for (let i = 0; i < ids.length; i += 500) {
          await prisma.propertyAttribute.createMany({ data: ids.slice(i, i + 500).map((propertyId) => ({ propertyId, key: "pin_geocode", value: `not_found:${g.pin}` })) });
        }
      }
    }
    await sleep(GAP_MS);
  }
  return out;
}
