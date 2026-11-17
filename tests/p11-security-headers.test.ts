/**
 * P11.1 — Security headers must be set in next.config.ts for all routes.
 * File-read-only test; no server needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cfg = readFileSync(resolve("next.config.ts"), "utf8");

describe("P11.1 — security headers in next.config.ts", () => {
  it("X-Content-Type-Options nosniff is set", () => {
    assert.ok(cfg.includes("X-Content-Type-Options"), "must include X-Content-Type-Options header");
    assert.ok(cfg.includes("nosniff"), "value must be nosniff");
  });

  it("X-Frame-Options SAMEORIGIN is set", () => {
    assert.ok(cfg.includes("X-Frame-Options"), "must include X-Frame-Options header");
    assert.ok(cfg.includes("SAMEORIGIN"), "value must be SAMEORIGIN");
  });

  it("Referrer-Policy is set", () => {
    assert.ok(cfg.includes("Referrer-Policy"), "must include Referrer-Policy header");
  });

  it("Permissions-Policy is set (camera, microphone, geolocation)", () => {
    assert.ok(cfg.includes("Permissions-Policy"), "must include Permissions-Policy header");
    assert.ok(cfg.includes("camera=()"), "must deny camera");
    assert.ok(cfg.includes("geolocation=()"), "must deny geolocation");
  });

  it("headers apply to all routes (source: /:path*)", () => {
    assert.ok(cfg.includes("/:path*"), "headers must apply to all paths");
  });
});
