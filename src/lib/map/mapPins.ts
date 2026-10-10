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

/** How the stored point was obtained: from the notice (exact), the centre of the PIN code area, or the centre of the city. */
export type PinQuality = "exact" | "pincode" | "city_centroid";

export const qualityOf = (coordQuality: string | null): PinQuality => (coordQuality === "pincode" ? "pincode" : coordQuality === "city_centroid" ? "city_centroid" : "exact");

export const qualityLabel = (q: PinQuality): string => (q === "exact" ? "Exact location" : q === "pincode" ? "Approximate: PIN code area" : "Approximate: city centre");

export interface MapPin {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  point: Coordinates;
  /** true: the stored point is a city centre, not the property's own address point. */
  approximate: boolean;
  quality: PinQuality;
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
    pins.push({ id: r.id, slug: r.slug, title: r.title, city: r.geoCity, point, approximate: qualityOf(r.coordQuality) !== "exact", quality: qualityOf(r.coordQuality), reservePrice: r.reservePrice });
  }
  return { pins, withoutLocation };
}

/** "252 listings match · 248 on the map (all approximate: city centre)". Honest about what is and is not on the map. */
export function pinSummary(total: number, shown: number, approximate: number, capped: boolean): string {
  if (total === 0) return "No listings match these filters.";
  if (shown === 0) return `${total.toLocaleString("en-IN")} listing${total === 1 ? "" : "s"} match, but none has a verified map location yet.`;
  const exact = shown - approximate;
  const kind = approximate === 0 ? "exact locations" : exact === 0 ? "all approximate" : `${exact} exact, ${approximate} approximate`;
  const cap = capped ? ` The map shows the first ${shown.toLocaleString("en-IN")} of them.` : "";
  return `${total.toLocaleString("en-IN")} listing${total === 1 ? "" : "s"} match · ${shown.toLocaleString("en-IN")} on the map (${kind}).${cap}`;
}

export interface PinGroup {
  /** Stable key of the shared point. */
  key: string;
  point: Coordinates;
  pins: MapPin[];
}

/**
 * Properties that share one stored point (all of a PIN area, or all of a city centre) are ONE marker with a count, not hundreds of
 * markers on top of each other and not points moved around to fake a layout. The order of groups and of pins in a group is the input order.
 */
export function groupPins(pins: MapPin[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const p of pins) {
    const key = `${p.point.lat.toFixed(4)}|${p.point.lng.toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.pins.push(p);
    else groups.set(key, { key, point: p.point, pins: [p] });
  }
  return [...groups.values()];
}
