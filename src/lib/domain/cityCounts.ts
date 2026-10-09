/*
 * City counts for the homepage city cards and the city pages (pure, no database).
 *
 * ONE definition, shared with the results page (publishedWhere in queries/listProperties.ts):
 *   - the city is the canonical AI-verified `geoCity` and nothing else: no source-city fallback, no text search;
 *   - the number shown on a card is ACTIVE opportunities: distinct published properties with at least one auction round whose
 *     effective status is Upcoming, Live or Auction Today (auctionLifecycle.ts). A property with several qualifying rounds counts once;
 *   - Postponed, Cancelled and ended auctions, and properties with no auction round, are not active;
 *   - active properties without a usable canonical city are NOT assigned to any city: they are reported as `unassignedActive`.
 * The database does the filtering (publishedWhere); this module only turns the grouped rows into the per-city list.
 */
import { canonCity } from "../pipeline/locations";

export const citySlug = (city: string) => city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface CityCount {
  city: string;
  slug: string;
  /** Active opportunities (see above). This is the number a city card shows. */
  count: number;
  /** All published properties whose canonical geoCity is this city, any status, including ones with no auction round. */
  total: number;
}

export interface CitySummary {
  cities: CityCount[];
  /** Distinct published properties with an active round, in any city or none. */
  activeTotal: number;
  /** Active properties that are in no city above: geoCity missing, not in canonical spelling, or implausibly long. */
  unassignedActive: number;
}

/** One group from `property.groupBy({ by: ["geoCity"], _count })`. */
export interface GeoCityGroup {
  geoCity: string | null;
  n: number;
}

export const MAX_CITY_NAME = 40;

/**
 * A geoCity value is usable only when the results page can find it again: `geoCity equals canonCity(city)` (case-insensitive) must
 * match, so the stored value has to be the canonical spelling already ("Bombay" is not; "mumbai" is, apart from case).
 */
export function usableGeoCity(geoCity: string | null | undefined): string | null {
  if (!geoCity || geoCity.length > MAX_CITY_NAME) return null;
  const canon = canonCity(geoCity);
  return canon.toLowerCase() === geoCity.toLowerCase() ? canon : null;
}

export function buildCitySummary(active: GeoCityGroup[], all: GeoCityGroup[], activeTotal: number, priorityCities: readonly string[]): CitySummary {
  const byCity = new Map<string, CityCount>();
  const entry = (city: string) => {
    let e = byCity.get(city);
    if (!e) byCity.set(city, (e = { city, slug: citySlug(city), count: 0, total: 0 }));
    return e;
  };
  for (const g of all) {
    const city = usableGeoCity(g.geoCity);
    if (city) entry(city).total += g.n;
  }
  let assigned = 0;
  for (const g of active) {
    const city = usableGeoCity(g.geoCity);
    if (!city) continue;
    entry(city).count += g.n;
    assigned += g.n;
  }
  const priority = new Map(priorityCities.map((c, i) => [canonCity(c), i]));
  const cities = [...byCity.values()]
    .filter((c) => c.total > 0 || c.count > 0)
    .sort((a, b) => {
      const pa = priority.get(a.city) ?? 999;
      const pb = priority.get(b.city) ?? 999;
      return pa !== pb ? pa - pb : b.count - a.count || a.city.localeCompare(b.city);
    });
  return { cities, activeTotal, unassignedActive: Math.max(0, activeTotal - assigned) };
}
