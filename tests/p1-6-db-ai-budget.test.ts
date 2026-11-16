import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { budgetLevel, dailyCap } from "../src/lib/ai/dailyBudget";

describe("budgetLevel (pure)", () => {
  it("returns 'none' when cap is 0", () => {
    assert.equal(budgetLevel(0, 0), "none");
    assert.equal(budgetLevel(999, 0), "none");
  });

  it("returns 'none' when cap is negative", () => {
    assert.equal(budgetLevel(0, -1), "none");
  });

  it("returns 'ok' when well under cap", () => {
    assert.equal(budgetLevel(0, 10_000), "ok");
    assert.equal(budgetLevel(7_999, 10_000), "ok");
  });

  it("returns 'warning' at 80% of cap", () => {
    assert.equal(budgetLevel(8_000, 10_000), "warning");
    assert.equal(budgetLevel(9_999, 10_000), "warning");
  });

  it("returns 'exceeded' at exactly the cap", () => {
    assert.equal(budgetLevel(10_000, 10_000), "exceeded");
  });

  it("returns 'exceeded' when over cap", () => {
    assert.equal(budgetLevel(12_000, 10_000), "exceeded");
  });

  it("blocks when estimated tokens would push over cap", () => {
    // used=9_900, cap=10_000, estimated=200: 9_900+200=10_100 >= 10_000 → exceeded
    assert.equal(budgetLevel(9_900 + 200, 10_000), "exceeded");
  });
});

describe("dailyCap", () => {
  it("returns 0 when env var not set", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    delete process.env.AI_DAILY_TOKEN_CAP;
    assert.equal(dailyCap(), 0);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
  });

  it("returns numeric value when env var is set", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "50000";
    assert.equal(dailyCap(), 50_000);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });

  it("returns 0 for non-numeric env var", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "not-a-number";
    assert.equal(dailyCap(), 0);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });
});
