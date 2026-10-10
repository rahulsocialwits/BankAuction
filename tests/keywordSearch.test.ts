import test from "node:test";
import assert from "node:assert/strict";
import { keywordClauses, spellingVariants } from "../src/lib/queries/publishedWhere";

const fieldsOf = (clause: unknown) => (clause as { OR: Record<string, unknown>[] }).OR.map((o) => Object.keys(o)[0]);

test("keyword search: every word must match, each across address, city, state, locality, title and description", () => {
  const c = keywordClauses("Flat, Andheri  Mumbai 400058");
  assert.equal(c.length, 4);
  assert.deepEqual(fieldsOf(c[0]).slice(0, 6), ["title", "description", "addressText", "geoCity", "geoState", "geoLocality"]);
  assert.deepEqual(keywordClauses("   "), []);
});

test("spelling variants: nalasopara reaches the stored spelling Nallasopara; numbers and short words get none", () => {
  assert.ok(spellingVariants("nalasopara").includes("nallasopara"));
  assert.ok(spellingVariants("Nallasopara").includes("nalasopara"));
  assert.deepEqual(spellingVariants("400058"), []);
  assert.deepEqual(spellingVariants("flat"), spellingVariants("flat")); // plain 4-letter word: variants are allowed, never the word itself
  assert.ok(!spellingVariants("flat").includes("flat"));
  assert.ok(spellingVariants("nalasopara").length <= 14);
});

test("a word typed with a space still matches when joined (nala sopara)", () => {
  const c = keywordClauses("nala sopara");
  assert.equal(c.length, 1);
  const json = JSON.stringify(c);
  assert.match(json, /nalasopara/);
  assert.match(json, /nallasopara/);
});

test("a PIN code is matched as typed, in the address", () => {
  const c = keywordClauses("401209");
  assert.match(JSON.stringify(c), /"addressText":\{"contains":"401209"/);
  assert.doesNotMatch(JSON.stringify(c), /4012009/);
});
