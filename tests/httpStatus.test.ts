import test from "node:test";
import assert from "node:assert/strict";
import { classifyBody, classifyResponse, fetchWithRetry, isRefusal, parseRetryAfter } from "../src/lib/fetch/httpStatus";

type Step = { status: number; headers?: Record<string, string>; body?: string };

/** A fake fetch that answers the given steps in order, and a fake sleep that records the waits. */
function harness(steps: Step[]) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const s = steps[Math.min(calls.length - 1, steps.length - 1)];
    return new Response(s.body ?? "<html><body>ok</body></html>", { status: s.status, headers: { "content-type": "text/html", ...(s.headers ?? {}) } });
  };
  return { calls, sleeps, opts: { fetchFn, sleep: async (ms: number) => { sleeps.push(ms); } } };
}

test("parseRetryAfter: seconds, HTTP date, junk", () => {
  assert.equal(parseRetryAfter("8"), 8);
  assert.equal(parseRetryAfter(" 12 "), 12);
  assert.equal(parseRetryAfter("abc"), null);
  assert.equal(parseRetryAfter(null), null);
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(parseRetryAfter("Thu, 01 Jan 2026 00:00:15 GMT", now), 15);
  assert.equal(parseRetryAfter("Wed, 31 Dec 2025 23:00:00 GMT", now), 0);
});

test("429 with Retry-After: waits that long, retries once, success is processed normally", async () => {
  const h = harness([{ status: 429, headers: { "retry-after": "8" } }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "success");
  assert.equal(out.attempts, 2);
  assert.deepEqual(h.sleeps, [8000]);
  assert.equal(h.calls.length, 2);
  assert.ok(out.log.some((l) => l.includes("429 received → Retry-After: 8 → waiting 8s → retrying once")));
});

test("429 without Retry-After: configured default delay, one retry", async () => {
  const h = harness([{ status: 429 }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, { ...h.opts, defaultDelaySec: 6 });
  assert.equal(out.status, "success");
  assert.deepEqual(h.sleeps, [6000]);
  assert.ok(out.log.some((l) => l.includes("429 received → no Retry-After → applying configured retry delay")));
});

test("Retry-After above 20 s is capped at 20 s", async () => {
  const h = harness([{ status: 429, headers: { "retry-after": "300" } }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.deepEqual(h.sleeps, [20000]);
  assert.equal(out.status, "success");
  assert.ok(out.log[0].includes("capped to 20s"));
});

test("503 with Retry-After: waits, retries once, success", async () => {
  const h = harness([{ status: 503, headers: { "retry-after": "3" } }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "success");
  assert.deepEqual(h.sleeps, [3000]);
  assert.ok(out.log[0].startsWith("503 received → Retry-After: 3"));
});

test("503 without Retry-After: default delay, one retry", async () => {
  const h = harness([{ status: 503 }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "success");
  assert.equal(h.sleeps.length, 1);
  assert.ok(out.log[0].startsWith("503 received → no Retry-After"));
});

test("failed retry: second 429 is rate_limited (temporary, NOT blocked), never a third request", async () => {
  const h = harness([{ status: 429, headers: { "retry-after": "1" } }, { status: 429 }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "rate_limited");
  assert.equal(isRefusal(out.status), false);
  assert.equal(h.calls.length, 2);
  assert.equal(out.attempts, 2);
});

test("failed retry: second 503 is service_unavailable (temporary, NOT blocked)", async () => {
  const h = harness([{ status: 503 }, { status: 503 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "service_unavailable");
  assert.equal(isRefusal(out.status), false);
  assert.equal(h.calls.length, 2);
});

test("401 is unauthorized: refusal, no retry", async () => {
  const h = harness([{ status: 401 }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "unauthorized");
  assert.equal(isRefusal(out.status), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.sleeps.length, 0);
});

test("403 is forbidden: refusal, no retry, logged as Blocked", async () => {
  const h = harness([{ status: 403, body: "<html>Forbidden</html>" }, { status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "forbidden");
  assert.equal(isRefusal(out.status), true);
  assert.equal(h.calls.length, 1);
  assert.ok(out.log.some((l) => l.includes("403 received → access denied → source marked Blocked")));
});

test("CAPTCHA / challenge pages are detected and never retried", async () => {
  for (const body of ['<html><body><div class="g-recaptcha"></div>Please solve the CAPTCHA</body></html>', "<html><head><title>Just a moment...</title></head><body>cf-chl-bypass</body></html>"]) {
    const h = harness([{ status: 403, body }, { status: 200 }]);
    const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
    assert.equal(out.status, "captcha");
    assert.equal(isRefusal(out.status), true);
    assert.equal(h.calls.length, 1);
  }
  // a small HTTP 200 challenge screen counts too
  const h200 = harness([{ status: 200, body: "<html><title>Attention Required! | Cloudflare</title><div class='cf-turnstile'></div></html>" }]);
  assert.equal((await fetchWithRetry("https://x.in/a", {}, h200.opts)).status, "captcha");
  // cf-mitigated header
  assert.equal(classifyResponse(403, { get: (n: string) => (n === "cf-mitigated" ? "challenge" : null) }), "captcha");
});

test("a normal big page that merely contains a reCAPTCHA form box is NOT a challenge", () => {
  const big = "<html>" + "<p>listing</p>".repeat(3000) + '<div class="g-recaptcha"></div></html>';
  assert.equal(classifyBody(big, 200), null);
  assert.equal(classifyResponse(200, { get: () => null }, big), "success");
});

test("explicit anti-bot access-denied page is blocked", () => {
  assert.equal(classifyResponse(200, { get: () => null }, "<html><title>Access Denied</title>You do not have permission</html>"), "blocked");
});

test("network error is temporary_error (not blocked)", async () => {
  const out = await fetchWithRetry("https://x.in/a", {}, { fetchFn: async () => { throw new Error("ECONNRESET"); }, sleep: async () => undefined });
  assert.equal(out.status, "temporary_error");
  assert.equal(isRefusal(out.status), false);
  assert.equal(out.res, null);
});

test("success needs no wait and one request", async () => {
  const h = harness([{ status: 200 }]);
  const out = await fetchWithRetry("https://x.in/a", {}, h.opts);
  assert.equal(out.status, "success");
  assert.equal(out.attempts, 1);
  assert.equal(h.sleeps.length, 0);
});
