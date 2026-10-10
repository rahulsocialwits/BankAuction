import { validCoordinates, type Coordinates } from "./coordinates";

/*
 * Pins for the map view (pure). The map shows every listing that matches the filters (up to a cap), not only the 48 of the current
 * page. A pin comes only from the property's own stored coordinates: nothing is guessed, and a point is "approximate" when the
 * stored value is a city centre (property attribute coord_quality = city_centroid) rather than a point taken from the notice.
 */

export const MAP_PIN_CAP = 2000;

export interface MapPinRow {
  id: string;
  slug: string;
  title: string;
  geoCity: string | null;
  latitude: number | null;
  longitude: number | null;
  coordQuality: string | null;
  reservePrice: number | null;
}

export interface MapPin {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  point: Coordinates;
  /** true: the stored point is a city centre, not the property's own address point. */
  approximate: boolean;
  reservePrice: number | null;
}

/** Valid, de-duplicated pins (the first row of an id wins) and how many rows had no usable coordinates. */
export function toMapPins(rows: MapPinRow[]): { pins: MapPin[]; withoutLocation: number } {
  const seen = new Set<string>();
  const pins: MapPin[] = [];
  let withoutLocation = 0;
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const point = validCoordinates(r.latitude, r.longitude);
    if (!point) { withoutLocation++; continue; }
    pins.push({ id: r.id, slug: r.slug, title: r.title, city: r.geoCity, point, approximate: r.coordQuality === "city_centroid", reservePrice: r.reservePrice });
  }
  return { pins, withoutLocation };
}

/** "252 listings match · 248 on the map (all approximate: city centre)". Honest about what is and is not on the map. */
export function pinSummary(total: number, shown: number, approximate: number, capped: boolean): string {
  if (total === 0) return "No listings match these filters.";
  if (shown === 0) return `${total.toLocaleString("en-IN")} listing${total === 1 ? "" : "s"} match, but none has a verified map location yet.`;
  const exact = shown - approximate;
  const kind = approximate === 0 ? "exact locations" : exact === 0 ? "approximate: city centre" : `${exact} exact, ${approximate} approximate`;
  const cap = capped ? ` The map shows the first ${shown.toLocaleString("en-IN")} of them.` : "";
  return `${total.toLocaleString("en-IN")} listing${total === 1 ? "" : "s"} match · ${shown.toLocaleString("en-IN")} on the map (${kind}).${cap}`;
}
