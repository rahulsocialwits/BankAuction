import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { budgetLevel, dailyCap, DEFAULT_DAILY_TOKEN_CAP } from "../src/lib/ai/dailyBudget";

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
    assert.equal(budgetLevel(9_900 + 200, 10_000), "exceeded");
  });
});

describe("dailyCap", () => {
  it("returns default 50,000 when env var not set", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    delete process.env.AI_DAILY_TOKEN_CAP;
    assert.equal(dailyCap(), DEFAULT_DAILY_TOKEN_CAP);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
  });

  it("returns default 50,000 when env var is empty string", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "";
    assert.equal(dailyCap(), DEFAULT_DAILY_TOKEN_CAP);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });

  it("returns numeric value when env var is set", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "100000";
    assert.equal(dailyCap(), 100_000);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });

  it("returns default for non-numeric env var", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "not-a-number";
    assert.equal(dailyCap(), DEFAULT_DAILY_TOKEN_CAP);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });

  it("returns default for 0 (zero disables makes no sense for a budget)", () => {
    const original = process.env.AI_DAILY_TOKEN_CAP;
    process.env.AI_DAILY_TOKEN_CAP = "0";
    assert.equal(dailyCap(), DEFAULT_DAILY_TOKEN_CAP);
    if (original !== undefined) process.env.AI_DAILY_TOKEN_CAP = original;
    else delete process.env.AI_DAILY_TOKEN_CAP;
  });
});
