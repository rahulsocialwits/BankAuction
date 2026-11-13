/**
 * Regression tests for the P0.5 SSRF protection utility (assertPublicUrl / isPrivateAddress).
 *
 * These tests run with no network I/O: private/loopback addresses are caught by the hostname
 * blocklist or the IP-literal check before any DNS resolution is attempted.
 *
 * Tests that require DNS resolution (e.g. assertPublicUrl("http://169.254.169.254/...")) are
 * also included as IP-literal checks (the hostname IS the IP, so DNS is skipped).
 *
 * Tests that require a live DNS server to verify that an internal hostname resolves to a private
 * IP are BLOCKED in this sandbox (no network access to external resolvers).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateAddress, assertPublicUrl, SsrfBlockedError } from "../src/lib/fetch/assertPublicUrl";

// ---- isPrivateAddress ---- //

test("isPrivateAddress: loopback IPv4", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("127.255.255.255"), true);
});

test("isPrivateAddress: private RFC 1918 ranges", () => {
  assert.equal(isPrivateAddress("10.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("172.16.0.1"), true);
  assert.equal(isPrivateAddress("172.31.255.255"), true);
});

test("isPrivateAddress: link-local (169.254.x.x) — AWS metadata endpoint", () => {
  assert.equal(isPrivateAddress("169.254.169.254"), true);
});

test("isPrivateAddress: 0.0.0.0 meta-address", () => {
  assert.equal(isPrivateAddress("0.0.0.0"), true);
});

test("isPrivateAddress: multicast and reserved", () => {
  assert.equal(isPrivateAddress("224.0.0.1"), true);
  assert.equal(isPrivateAddress("255.255.255.255"), true);
});

test("isPrivateAddress: public IPs are not private", () => {
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("142.250.0.1"), false);
});

test("isPrivateAddress: IPv6 loopback", () => {
  assert.equal(isPrivateAddress("::1"), true);
});

test("isPrivateAddress: IPv6 link-local (fe80)", () => {
  assert.equal(isPrivateAddress("fe80::1"), true);
});

test("isPrivateAddress: IPv6 unique-local (fc/fd)", () => {
  assert.equal(isPrivateAddress("fc00::1"), true);
  assert.equal(isPrivateAddress("fd00::1"), true);
});

test("isPrivateAddress: IPv4-mapped private (::ffff:127.0.0.1)", () => {
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
});

// ---- assertPublicUrl: synchronous blocklist checks (no DNS) ---- //

test("assertPublicUrl: rejects non-http/https protocol", async () => {
  await assert.rejects(
    () => assertPublicUrl("ftp://example.com/file"),
    (e: Error) => e instanceof SsrfBlockedError && e.message.includes("ftp:"),
  );
});

test("assertPublicUrl: rejects malformed URL", async () => {
  await assert.rejects(
    () => assertPublicUrl("not a url"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

test("assertPublicUrl: rejects localhost", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://localhost/admin"),
    (e: Error) => e instanceof SsrfBlockedError && e.message.includes("localhost"),
  );
});

test("assertPublicUrl: rejects *.local hostnames", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://internal.local/api"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

test("assertPublicUrl: rejects *.internal hostnames", async () => {
  await assert.rejects(
    () => assertPublicUrl("https://metadata.internal/computeMetadata/v1/"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

test("assertPublicUrl: rejects IP-literal private address (loopback)", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://127.0.0.1:8080/"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

test("assertPublicUrl: rejects IP-literal AWS metadata endpoint", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://169.254.169.254/latest/meta-data/"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

test("assertPublicUrl: rejects IP-literal private RFC 1918", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://192.168.1.1/"),
    (e: Error) => e instanceof SsrfBlockedError,
  );
});

// ---- assertPublicUrl applied to fetchWithRetry (structural check) ---- //

test("fetchWithRetry source imports assertPublicUrl (structural wiring check)", () => {
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "lib", "fetch", "httpStatus.ts"),
    "utf8",
  );
  assert.match(src, /assertPublicUrl/, "httpStatus.ts must import and call assertPublicUrl");
  assert.match(src, /SsrfBlockedError/, "httpStatus.ts must handle SsrfBlockedError");
  assert.match(src, /internal_policy_block/, "httpStatus.ts must return internal_policy_block status on SSRF block");
});
