import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INDIA_BOUNDS,
  initialSelection,
  mapSummary,
  parseView,
  selectionReducer,
  splitMappable,
  validCoordinates,
  viewHref,
  type Selection,
  type SelectionAction,
} from "../src/lib/map/coordinates";
import { publishedWhere } from "../src/lib/queries/publishedWhere";

/* ---- reliable coordinates only: never invented ---- */

test("real Indian coordinates are accepted", () => {
  assert.deepEqual(validCoordinates(19.076, 72.8777), { lat: 19.076, lng: 72.8777 }); // Mumbai
  assert.deepEqual(validCoordinates(8.0883, 77.5385), { lat: 8.0883, lng: 77.5385 }); // Kanyakumari
  assert.deepEqual(validCoordinates(34.0837, 74.7973), { lat: 34.0837, lng: 74.7973 }); // Srinagar
});

test("missing, placeholder, non-numeric and out-of-India coordinates are rejected, not repaired", () => {
  assert.equal(validCoordinates(null, null), null);
  assert.equal(validCoordinates(19.07, null), null, "one half missing");
  assert.equal(validCoordinates(undefined, 72.8), null);
  assert.equal(validCoordinates(0, 0), null, "the (0, 0) placeholder");
  assert.equal(validCoordinates(NaN, 72.8), null);
  assert.equal(validCoordinates(19.07, Infinity), null);
  assert.equal(validCoordinates("19.07", "72.8"), null, "text is not a coordinate");
  assert.equal(validCoordinates(72.8777, 19.076), null, "swapped latitude/longitude is rejected, not silently swapped");
  assert.equal(validCoordinates(51.5, -0.12), null, "London");
  assert.equal(validCoordinates(INDIA_BOUNDS.minLat - 0.01, 78), null);
  assert.equal(validCoordinates(20, INDIA_BOUNDS.maxLng + 0.01), null);
});

test("a page of properties splits into pins and unmapped listings, order kept", () => {
  const rows = [
    { id: "a", latitude: 19.07, longitude: 72.87 },
    { id: "b", latitude: null, longitude: null },
    { id: "c", latitude: 0, longitude: 0 },
    { id: "d", latitude: 12.97, longitude: 77.59 },
    { id: "e", latitude: 40, longitude: 72 },
  ];
  const { mappable, unmapped } = splitMappable(rows);
  assert.deepEqual(mappable.map((m) => m.row.id), ["a", "d"]);
  assert.deepEqual(unmapped.map((r) => r.id), ["b", "c", "e"]);
  assert.deepEqual(splitMappable([]), { mappable: [], unmapped: [] });
});

test("the empty-state and summary text never claim coordinates that are not there", () => {
  assert.equal(mapSummary(0, 0), "No listings on this page.");
  assert.match(mapSummary(0, 48), /None of the listings/);
  assert.equal(mapSummary(12, 48), "12 of 48 listings on this page have a map location.");
  assert.equal(mapSummary(3, 3), "All 3 listings on this page have a map location.");
  assert.equal(mapSummary(1, 1), "All 1 listing on this page has a map location.");
});

/* ---- Map / List toggle keeps filters, page and status logic ---- */

const filters = { category: "RESIDENTIAL", q: "flat", bank: "b1", state: "Maharashtra", city: "Mumbai", locality: undefined, status: "active", priceMin: "1000000", priceMax: undefined, page: "3" };

test("the map link keeps every filter and the page number; the list link drops only the view", () => {
  const map = new URL(viewHref(filters, "map"), "https://x.test");
  assert.equal(map.pathname, "/properties");
  assert.equal(map.searchParams.get("view"), "map");
  for (const [k, v] of Object.entries(filters)) if (v) assert.equal(map.searchParams.get(k), v, k);
  assert.equal(map.searchParams.has("locality"), false, "an empty filter is not added");

  const list = new URL(viewHref({ ...filters, view: "map" }, "list"), "https://x.test");
  assert.equal(list.searchParams.has("view"), false, "list is the default and adds no parameter");
  assert.equal(list.searchParams.get("city"), "Mumbai");
  assert.equal(list.searchParams.get("page"), "3");

  assert.equal(viewHref({}, "list"), "/properties", "existing /properties links are unchanged");
  assert.equal(viewHref({}, "map"), "/properties?view=map");
});

test("only view=map selects the map; anything else is the list", () => {
  assert.equal(parseView("map"), "map");
  for (const v of [undefined, "", "list", "MAP", "grid", "map "]) assert.equal(parseView(v), "list", String(v));
});

test("the map shows the same properties as the list: the view is not part of the database filter", () => {
  // statusGroup "all" has no timestamps, so the two clauses can be compared exactly.
  const f = { city: "Mumbai", statusGroup: "all" as const, bankId: "b1", priceMin: 1, priceMax: 9 };
  assert.deepEqual(publishedWhere({ ...f, view: "map" } as never), publishedWhere(f), "an extra view option changes nothing");
  assert.doesNotMatch(readFileSync(join(__dirname, "..", "src/lib/queries/publishedWhere.ts"), "utf8"), /view|latitude|longitude/i, "the shared where-clause knows nothing about the map, so filters and status logic cannot diverge");
  assert.doesNotMatch(readFileSync(join(__dirname, "..", "src/lib/queries/listProperties.ts"), "utf8"), /latitude|longitude/i, "the list query is not narrowed to properties with coordinates");
});

/* ---- card <-> pin interaction ---- */

const ids = new Set(["a", "b"]);
const run = (actions: SelectionAction[], start: Selection = initialSelection) => actions.reduce((s, a) => selectionReducer(s, a, ids), start);

test("clicking a pin selects its card, and the card knows the pick came from the pin", () => {
  assert.deepEqual(run([{ type: "pin", id: "a" }]), { selectedId: "a", hoverId: null, source: "pin" });
});

test("choosing 'Show on map' on a card selects its pin, and the map knows the pick came from the card", () => {
  assert.deepEqual(run([{ type: "card", id: "b" }]), { selectedId: "b", hoverId: null, source: "card" });
});

test("hovering a card highlights its pin without changing the selection; leaving clears the hover", () => {
  const picked = run([{ type: "pin", id: "a" }]);
  const hovered = run([{ type: "hover", id: "b" }], picked);
  assert.deepEqual(hovered, { selectedId: "a", hoverId: "b", source: "pin" });
  assert.equal(run([{ type: "hover", id: null }], hovered).hoverId, null);
});

test("a listing without a pin can never be selected or hovered", () => {
  assert.deepEqual(run([{ type: "card", id: "no-coords" }]), initialSelection);
  assert.deepEqual(run([{ type: "pin", id: "ghost" }]), initialSelection);
  assert.deepEqual(run([{ type: "hover", id: "no-coords" }]), initialSelection);
});

test("clicking the empty map clears the selection; a new pick replaces the old one", () => {
  const s = run([{ type: "pin", id: "a" }, { type: "card", id: "b" }]);
  assert.equal(s.selectedId, "b");
  assert.deepEqual(run([{ type: "clear" }], s), { selectedId: null, hoverId: null, source: null });
});

/* ---- source-level guards ---- */

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

test("the page keeps the shared filters, pagination and cards in both views, and the form keeps the view", () => {
  const page = read("src/app/(site)/properties/page.tsx");
  assert.match(page, /listPublishedProperties\(/);
  assert.match(page, /countPublishedProperties\(filters\)/);
  assert.match(page, /view: view === "map" \? "map" : undefined/, "pagination links keep the map view");
  assert.match(page, /toPropertyCardData\(p\)/);
  assert.match(page, /<ViewToggle/);
  assert.match(read("src/components/PropertyFilterForm.tsx"), /name="view" value="map"/);
});

test("the map component never builds HTML from listing text, never geocodes, and uses no API key", () => {
  const c = read("src/components/PropertyMapView.tsx");
  assert.match(c, /\.textContent = item\.title/);
  assert.doesNotMatch(c, /bindPopup\(`|innerHTML/, "popup content is built from text nodes");
  assert.doesNotMatch(c, /geocod|nominatim|googleapis|api[_-]?key/i);
  assert.match(c, /\/property\/\$\{item\.slug\}/, "pins link to the existing property detail page");
  const cfg = read("src/lib/map/config.ts");
  assert.match(cfg, /openstreetmap\.org/);
  assert.match(cfg, /OpenStreetMap/, "attribution is shown");
  assert.doesNotMatch(read("src/lib/map/coordinates.ts"), /fetch\(|prisma/);
});

test("the map feature writes nothing and reads only coordinates already stored on the property", () => {
  for (const f of ["src/lib/map/coordinates.ts", "src/components/PropertyMapView.tsx", "src/components/ViewToggle.tsx"]) {
    assert.doesNotMatch(read(f), /\.(create|update|updateMany|delete|deleteMany|upsert)\(/, f);
  }
});
