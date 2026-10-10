import test from "node:test";
import assert from "node:assert/strict";
import { spreadPoints, validCoordinates } from "../src/lib/map/coordinates";
import { lookupCity } from "../src/lib/map/cityCoordinates";

test("pins that share one city point are spread onto a small ring; a lone pin is not moved", () => {
  const pt = { lat: 19.076, lng: 72.8777 };
  const items = [...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, point: pt })), { id: "solo", point: { lat: 28.6139, lng: 77.209 } }, { id: "none", point: null }];
  const out = spreadPoints(items);
  assert.deepEqual(out.get("solo"), { lat: 28.6139, lng: 77.209 });
  assert.equal(out.has("none"), false);
  const coords = Array.from({ length: 10 }, (_, i) => out.get(`m${i}`)!);
  assert.equal(new Set(coords.map((c) => `${c.lat.toFixed(5)}|${c.lng.toFixed(5)}`)).size, 10, "every pin has its own position");
  for (const c of coords) {
    assert.ok(Math.abs(c.lat - pt.lat) <= 0.0081 && Math.abs(c.lng - pt.lng) <= 0.0095, "stays within about a kilometre of the city centre");
    assert.ok(validCoordinates(c.lat, c.lng), "still a valid point in India");
  }
  assert.deepEqual(spreadPoints(items).get("m3"), out.get("m3"), "deterministic");
});

const answer = (rows: unknown[], ok = true) => (async () => new Response(JSON.stringify(rows), { status: ok ? 200 : 503 })) as unknown as typeof fetch;

test("city lookup: the first answer inside the right state wins", async () => {
  const c = await lookupCity("Nashik", "Maharashtra", answer([{ lat: "19.9975", lon: "73.7898", address: { state: "Maharashtra" } }]));
  assert.deepEqual(c, { lat: 19.9975, lng: 73.7898 });
});

test("city lookup: the same city name in another state is skipped, a point outside India is refused, no answer is null", async () => {
  assert.equal(await lookupCity("Aurangabad", "Bihar", answer([{ lat: "19.87", lon: "75.34", address: { state: "Maharashtra" } }])), null);
  assert.equal(await lookupCity("Somewhere", "Kerala", answer([{ lat: "51.5", lon: "-0.12", address: { state: "Kerala" } }])), null);
  assert.equal(await lookupCity("Nowhere", "Kerala", answer([])), null);
});

test("city lookup: a provider error is an error (nothing is remembered as 'not found')", async () => {
  await assert.rejects(() => lookupCity("Pune", "Maharashtra", answer([], false)), /Nominatim HTTP 503/);
});
