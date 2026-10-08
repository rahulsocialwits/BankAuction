import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE_REGISTRY, getSourceDefinition } from "../src/data-sources/registry";

test("BAANKNET authorization is recorded as UNKNOWN / REQUIRES BUSINESS CONFIRMATION (not invented)", () => {
  const b = getSourceDefinition("baanknet");
  assert.ok(b);
  assert.equal(b.authorization, "UNKNOWN_REQUIRES_BUSINESS_CONFIRMATION");
  assert.match(b.accessNotes, /UNKNOWN \/ REQUIRES BUSINESS CONFIRMATION/);
  assert.match(b.accessNotes, /PSB Alliance/);
  assert.doesNotMatch(b.accessNotes, /Not built, and blocked in link sources/, "the importer exists; the old 'not built' claim was wrong");
  assert.equal(b.authorizationEvidence, undefined, "no evidence is recorded in the repository");
});

test("no source may be marked authorization CONFIRMED without recorded evidence", () => {
  for (const s of SOURCE_REGISTRY) {
    if (s.authorization === "CONFIRMED") {
      assert.ok(s.authorizationEvidence && s.authorizationEvidence.trim().length > 20, `${s.key}: CONFIRMED needs authorizationEvidence`);
    }
  }
});
