import test from "node:test";
import assert from "node:assert/strict";
import { pinSummary, toMapPins, type MapPinRow } from "../src/lib/map/mapPins";

const row = (o: Partial<MapPinRow> & { id: string }): MapPinRow => ({ slug: o.id, title: `Flat ${o.id}`, geoCity: "Mumbai", latitude: 19.055, longitude: 72.8692, coordQuality: "city_centroid", reservePrice: 5_000_000, ...o });

test("a verified Mumbai property keeps its Mumbai city label and point", () => {
  const { pins } = toMapPins([row({ id: "m1" })]);
  assert.equal(pins[0].city, "Mumbai");
  assert.ok(pins[0].point.lat > 18.8 && pins[0].point.lat < 19.4);
});

test("a Pune property is not turned into Mumbai (the city label comes from the property, never from the point)", () => {
  const { pins } = toMapPins([row({ id: "p1", geoCity: "Pune", latitude: 18.52137, longitude: 73.85451 })]);
  assert.equal(pins[0].city, "Pune");
});

test("no coordinates, (0,0), outside India or non-numbers: no pin is invented, the listing is counted as without location", () => {
  const { pins, withoutLocation } = toMapPins([
    row({ id: "a", latitude: null, longitude: null }),
    row({ id: "b", latitude: 0, longitude: 0 }),
    row({ id: "c", latitude: 51.5, longitude: -0.12 }),
    row({ id: "d", latitude: Number.NaN, longitude: 72.8 }),
    row({ id: "e", latitude: 72.8777, longitude: 19.076 }), // swapped
  ]);
  assert.equal(pins.length, 0);
  assert.equal(withoutLocation, 5);
});

test("the same property id gives one marker only", () => {
  assert.equal(toMapPins([row({ id: "x" }), row({ id: "x" }), row({ id: "y" })]).pins.length, 2);
});

test("a city-centre point is flagged approximate, a point from the notice is exact", () => {
  const { pins } = toMapPins([row({ id: "c" }), row({ id: "e", coordQuality: null })]);
  assert.deepEqual(pins.map((p) => p.approximate), [true, false]);
});

test("the summary states the listing count and the pin count, and says when the map is capped", () => {
  assert.match(pinSummary(252, 248, 248, false), /252 listings match · 248 on the map \(all approximate\)/);
  assert.match(pinSummary(5000, 2000, 2000, true), /first 2,000/);
  assert.match(pinSummary(3, 0, 0, false), /none has a verified map location/);
  assert.equal(pinSummary(0, 0, 0, false), "No listings match these filters.");
});
