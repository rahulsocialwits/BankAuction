/**
 * P11.2 — Rate limiting: login and register must call checkRateLimit.
 * File-read-only test; verifies wiring in source code.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loginSrc = readFileSync(resolve("src/app/(site)/login/actions.ts"), "utf8");
const registerSrc = readFileSync(resolve("src/app/(site)/register/actions.ts"), "utf8");
const rateLimitSrc = readFileSync(resolve("src/lib/security/rateLimit.ts"), "utf8");

describe("P11.2 — rate limit wiring", () => {
  it("login action imports checkRateLimit", () => {
    assert.ok(loginSrc.includes("checkRateLimit"), "login/actions.ts must import and call checkRateLimit");
  });

  it("login action blocks on rate limit exceeded", () => {
    assert.ok(loginSrc.includes("!allowed"), "login must redirect when rate limit exceeded");
  });

  it("register action imports checkRateLimit", () => {
    assert.ok(registerSrc.includes("checkRateLimit"), "register/actions.ts must import and call checkRateLimit");
  });

  it("register action has tighter limit than login", () => {
    const loginMax = loginSrc.match(/max:\s*(\d+)/)?.[1];
    const registerMax = registerSrc.match(/max:\s*(\d+)/)?.[1];
    assert.ok(loginMax && registerMax, "both must specify a max");
    assert.ok(Number(registerMax) <= Number(loginMax), "register limit must be <= login limit");
  });

  it("checkRateLimit fails open on DB error", () => {
    assert.ok(rateLimitSrc.includes("catch"), "must catch DB errors and fail open");
    assert.ok(rateLimitSrc.includes("return true"), "must return true (allow) on error");
  });

  it("rate limit uses sliding window via startedAt gte", () => {
    assert.ok(rateLimitSrc.includes("startedAt"), "must use startedAt for time window");
    assert.ok(rateLimitSrc.includes("gte"), "must use gte for sliding window query");
  });
});
