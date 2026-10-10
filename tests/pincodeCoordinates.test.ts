import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, extractPin, lookupPincode } from "../src/lib/map/pincodeCoordinates";
import { qualityLabel, qualityOf, toMapPins } from "../src/lib/map/mapPins";

const answer = (rows: unknown[], ok = true) => (async () => new Response(JSON.stringify(rows), { status: ok ? 200 : 503 })) as unknown as typeof fetch;
const MUMBAI = { lat: 19.055, lng: 72.8692 };

test("extractPin: the last 6-digit PIN of the address, never a longer number or a PIN starting with 0", () => {
  assert.equal(extractPin("Mumbai, Mumbai Suburban, Maharashtra, 400016"), "400016");
  assert.equal(extractPin("Flat 12, Andheri, Mumbai 400058, Maharashtra"), "400058");
  assert.equal(extractPin("Mumbai, Maharashtra"), null);
  assert.equal(extractPin("Survey 4000161234, Mumbai"), null);
  assert.equal(extractPin("012345"), null);
  assert.equal(extractPin(null), null);
});

test("PIN lookup: an answer in the right state and near the city is accepted", async () => {
  const r = await lookupPincode("400053", "Maharashtra", MUMBAI, answer([{ lat: "19.13854", lon: "72.82899", address: { state: "Maharashtra" } }]));
  assert.deepEqual(r, { found: { lat: 19.13854, lng: 72.82899 } });
});

test("PIN lookup: an answer in another state is rejected, never placed there", async () => {
  const r = await lookupPincode("313324", "Maharashtra", MUMBAI, answer([{ lat: "24.58", lon: "73.69", address: { state: "Rajasthan" } }]));
  assert.ok("rejected" in r);
});

test("PIN lookup: a point more than 65 km from the city of the property is rejected (Mumbai property is not placed in Pune)", async () => {
  const r = await lookupPincode("411001", "Maharashtra", MUMBAI, answer([{ lat: "18.52", lon: "73.85", address: { state: "Maharashtra" } }]));
  assert.ok("rejected" in r);
  assert.ok(distanceKm({ lat: 18.52, lng: 73.85 }, MUMBAI) > 100);
});

test("PIN lookup: no answer and an invalid point are rejected; a provider error is an error (nothing remembered)", async () => {
  assert.ok("rejected" in (await lookupPincode("999999", "Kerala", null, answer([]))));
  assert.ok("rejected" in (await lookupPincode("400001", "Maharashtra", null, answer([{ lat: "51.5", lon: "-0.1", address: { state: "Maharashtra" } }]))));
  await assert.rejects(() => lookupPincode("400001", "Maharashtra", null, answer([], false)), /Nominatim HTTP 503/);
});

test("quality: no coord_quality attribute means a point from the notice (exact); labels say what the pin is", () => {
  assert.equal(qualityOf(null), "exact");
  assert.equal(qualityOf("pincode"), "pincode");
  assert.equal(qualityOf("city_centroid"), "city_centroid");
  assert.equal(qualityLabel("pincode"), "Approximate: PIN code area");
  const { pins } = toMapPins([{ id: "a", slug: "a", title: "t", geoCity: "Mumbai", latitude: 19.1, longitude: 72.8, coordQuality: "pincode", reservePrice: null }]);
  assert.equal(pins[0].quality, "pincode");
  assert.equal(pins[0].approximate, true);
});
