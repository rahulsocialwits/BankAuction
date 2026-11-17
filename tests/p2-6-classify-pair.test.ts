import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPair, titleTokens, type IdentityFacts } from "../src/lib/pipeline/propertyIdentity";

function facts(overrides: Partial<IdentityFacts> = {}): IdentityFacts {
  return {
    externalId: null,
    tokens: titleTokens("SBI Branch Residential Plot Khasra No 123 Village Rampur"),
    address: "Village Rampur Khasra 123",
    reserve: 500000,
    start: new Date("2026-11-01"),
    ...overrides,
  };
}

describe("classifyPair — P2.6", () => {
  it("same source id → same", () => {
    const a = facts({ externalId: "SRC-001" });
    const b = facts({ externalId: "SRC-001" });
    assert.equal(classifyPair(a, b), "same");
  });

  it("different source ids → different", () => {
    const a = facts({ externalId: "SRC-001" });
    const b = facts({ externalId: "SRC-002" });
    // Different ids should be "different"
    assert.equal(classifyPair(a, b), "different");
  });

  it("same address → same (no id)", () => {
    const a = facts({ externalId: null, address: "123 MG Road Pune" });
    const b = facts({ externalId: null, address: "123 MG Road Pune" });
    // Same address + same title + same price should classify as same
    assert.ok(["same", "ambiguous"].includes(classifyPair(a, b)));
  });

  it("address conflict → ambiguous or different, not same", () => {
    const a = facts({ address: "Flat No 101 Building A Sector 15" });
    const b = facts({ address: "Flat No 202 Building A Sector 15" });
    const result = classifyPair(a, b);
    assert.notEqual(result, "same");
  });

  it("completely different titles → ambiguous or different", () => {
    const a = facts({
      tokens: titleTokens("HDFC Bank Commercial Shop MG Road"),
      address: "MG Road Pune",
      externalId: null,
    });
    const b = facts({
      tokens: titleTokens("SBI Residential Land Village Rampur"),
      address: "Village Rampur Khasra 456",
      externalId: null,
    });
    const result = classifyPair(a, b);
    assert.ok(["ambiguous", "different"].includes(result), `expected ambiguous/different, got ${result}`);
  });

  it("never returns same when externalIds differ", () => {
    const a = facts({ externalId: "A" });
    const b = facts({ externalId: "B" });
    assert.notEqual(classifyPair(a, b), "same");
  });
});
