import test from "node:test";
import assert from "node:assert/strict";
import { keywordClauses } from "../src/lib/queries/publishedWhere";

test("keyword search: every word must match, each across address, city, state, locality, title and description", () => {
  const c = keywordClauses("Flat, Andheri  Mumbai 400058");
  assert.equal(c.length, 4);
  const fields = (c[0] as { OR: Record<string, unknown>[] }).OR.map((o) => Object.keys(o)[0]);
  assert.deepEqual(fields, ["title", "description", "addressText", "geoCity", "geoState", "geoLocality"]);
  assert.deepEqual(keywordClauses("   "), []);
});
