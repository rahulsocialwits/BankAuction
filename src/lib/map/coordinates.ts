/*
 * Map helpers (pure, no database, no browser). A pin is drawn only for coordinates that look real; nothing is ever guessed or
 * geocoded from an address. Properties without reliable coordinates stay in the list and are counted as "not on the map".
 */

/** A generous box around India (mainland, islands, Ladakh). A point outside it is a data error, not a location. */
export const INDIA_BOUNDS = { minLat: 6, maxLat: 37.6, minLng: 68, maxLng: 97.5 } as const;

export interface Coordinates {
  lat: number;
  lng: number;
}

/** The coordinates when both are finite numbers inside India and not the (0, 0) placeholder; otherwise null. */
export function validCoordinates(lat: unknown, lng: unknown): Coordinates | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < INDIA_BOUNDS.minLat || lat > INDIA_BOUNDS.maxLat) return null;
  if (lng < INDIA_BOUNDS.minLng || lng > INDIA_BOUNDS.maxLng) return null;
  return { lat, lng };
}

/** Split a page of properties into those with reliable coordinates and those without, keeping the order. */
export function splitMappable<T extends { latitude: number | null; longitude: number | null }>(rows: T[]): { mappable: Array<{ row: T } & Coordinates>; unmapped: T[] } {
  const mappable: Array<{ row: T } & Coordinates> = [];
  const unmapped: T[] = [];
  for (const row of rows) {
    const c = validCoordinates(row.latitude, row.longitude);
    if (c) mappable.push({ row, ...c });
    else unmapped.push(row);
  }
  return { mappable, unmapped };
}

export type ListingView = "list" | "map";
export const parseView = (v: string | undefined): ListingView => (v === "map" ? "map" : "list");

/**
 * A /properties URL for `view`, keeping every filter and the page number as they are. The list view is the default and adds no
 * parameter, so existing links and bookmarks are unchanged.
 */
export function viewHref(params: Record<string, string | undefined>, view: ListingView): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "view") q.set(k, v);
  if (view === "map") q.set("view", "map");
  const s = q.toString();
  return s ? `/properties?${s}` : "/properties";
}

/* ---- the card <-> pin interaction, as a pure reducer so it can be tested without a browser ---- */

export interface Selection {
  /** The listing the person picked (pin or card): highlighted on both sides. */
  selectedId: string | null;
  /** The listing under the pointer or focus. */
  hoverId: string | null;
  /** Who made the pick: a pin click scrolls the card into view; a card pick moves the map. */
  source: "pin" | "card" | null;
}

export type SelectionAction =
  | { type: "pin"; id: string }
  | { type: "card"; id: string }
  | { type: "hover"; id: string | null }
  | { type: "clear" };

export const initialSelection: Selection = { selectedId: null, hoverId: null, source: null };

export function selectionReducer(state: Selection, action: SelectionAction, mappableIds: ReadonlySet<string>): Selection {
  switch (action.type) {
    case "pin":
    case "card":
      // Only a listing that has a pin can be selected; anything else is ignored.
      return mappableIds.has(action.id) ? { ...state, selectedId: action.id, source: action.type } : state;
    case "hover":
      return action.id === null || mappableIds.has(action.id) ? { ...state, hoverId: action.id } : state;
    case "clear":
      return { ...state, selectedId: null, source: null };
  }
}

/** "12 of 48 listings on this page have a map location." Always counts the page, never invents the rest. */
export function mapSummary(mapped: number, total: number): string {
  if (total === 0) return "No listings on this page.";
  if (mapped === 0) return "None of the listings on this page have a map location yet.";
  if (mapped === total) return `All ${total} listing${total === 1 ? "" : "s"} on this page ${total === 1 ? "has" : "have"} a map location.`;
  return `${mapped} of ${total} listings on this page have a map location.`;
}
