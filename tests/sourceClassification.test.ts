import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_HOSTS, checkSourceUrl, denylistMatch, relabelLegacyMessage } from "../src/data-sources/feeds/blockedHosts";
import { POLICY_PREFIX, describeStatus, fetchWithRetry, isRefusal } from "../src/lib/fetch/httpStatus";

const answer = (status: number, headers: Record<string, string> = {}, body = "<html>page</html>") => async (..._args: unknown[]) => new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
const nosleep = async () => undefined;

// ---- internal denylist vs. external refusal ----------------------------------------------------------------------------

test("REGRESSION: a denylisted host is reported as OUR configuration, never as the website refusing", () => {
  for (const host of BLOCKED_HOSTS) {
    const r = checkSourceUrl(`https://${host}/some/page`);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, "internal_policy_block");
    assert.ok(r.reason.startsWith(POLICY_PREFIX), r.reason);
    assert.ok(r.reason.includes(host) && r.reason.includes("blockedHosts.ts"));
    assert.ok(!/anti-bot|its terms or|refuses automated access|HTTP 40[13]/i.test(r.reason), "must not blame the website: " + r.reason);
  }
});

test("denylist matches the exact host and sub-domains only", () => {
  assert.equal(denylistMatch("www.auctionbazaar.com"), "auctionbazaar.com");
  assert.equal(denylistMatch("auctionbazaar.com"), "auctionbazaar.com");
  assert.equal(denylistMatch("baanknet.com"), null); // removed from the list by the project owner (commit 6c3a504): normal robots / HTTP checks apply
  assert.equal(denylistMatch("bankauction.co"), "bankauction.co");
  assert.equal(denylistMatch("bankauctions.in"), null); // a different site: must NOT match "bankauction.co"
  assert.equal(denylistMatch("notbankauction.co"), null);
  assert.equal(denylistMatch("eauctionsindia.com"), null);
});

test("a normal https source passes; bad input gets its own plain reason", () => {
  assert.deepEqual(checkSourceUrl("https://bankauctions.in/"), { ok: true, url: "https://bankauctions.in/" });
  const http = checkSourceUrl("http://example.com");
  assert.equal(http.ok, false);
  if (!http.ok) { assert.equal(http.reason, "Only https links are allowed"); assert.equal(http.status, undefined); }
  const bad = checkSourceUrl("not a url");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "Invalid URL");
});

test("rows saved with the old wrong wording are shown truthfully when their host is on our list", () => {
  const old = "Blocked: This website refuses automated access (its terms or anti-bot protection). Paused automatically.";
  assert.ok(relabelLegacyMessage("https://www.auctionbazaar.com/x", old)!.startsWith(POLICY_PREFIX));
  // a host that is NOT on our list keeps its message (the website really refused)
  assert.equal(relabelLegacyMessage("https://example.com/x", old), old);
  assert.equal(relabelLegacyMessage("https://auctionbazaar.com", null), null);
});

test("the UI texts name the real reason", () => {
  assert.equal(describeStatus("internal_policy_block", null), POLICY_PREFIX);
  assert.match(describeStatus("robots_disallowed", null), /^Blocked by robots\.txt/);
  assert.match(describeStatus("forbidden", 403), /^Website returned HTTP 403/);
  assert.match(describeStatus("unauthorized", 401), /^Website returned HTTP 401/);
  assert.match(describeStatus("captcha", 403), /^Automated access requires verification/);
  assert.match(describeStatus("rate_limited", 429), /^Rate limited/);
  assert.match(describeStatus("service_unavailable", 503), /^Temporary service unavailable/);
  assert.match(describeStatus("temporary_error", null), /^Network error/);
  // temporary states never claim a block or a refusal
  for (const s of ["rate_limited", "service_unavailable", "temporary_error"] as const) assert.ok(!/refus|blocked by|anti-bot|terms/i.test(describeStatus(s, 429)));
});

test("internal_policy_block is not counted as an external refusal", () => {
  assert.equal(isRefusal("internal_policy_block"), false);
  assert.equal(isRefusal("forbidden"), true);
});

// ---- genuine refusals still work ------------------------------------------------------------------------------------------

test("genuine 401 / 403 / CAPTCHA are still refusals (never retried)", async () => {
  for (const [code, status] of [[401, "unauthorized"], [403, "forbidden"]] as const) {
    let calls = 0;
    const out = await fetchWithRetry("https://ok.example/x", {}, { fetchFn: async (...a) => { calls++; return answer(code)(...a); }, sleep: nosleep });
    assert.equal(out.status, status);
    assert.equal(isRefusal(out.status), true);
    assert.equal(calls, 1);
  }
  const cap = await fetchWithRetry("https://ok.example/x", {}, { fetchFn: answer(403, {}, '<html><div class="g-recaptcha"></div>captcha</html>'), sleep: nosleep });
  assert.equal(cap.status, "captcha");
  assert.equal(isRefusal(cap.status), true);
});

// ---- 429 / 503 stay temporary ---------------------------------------------------------------------------------------------

test("429 / 503 are temporary (retry once), never refusals, and keep their real reason", async () => {
  for (const [code, status] of [[429, "rate_limited"], [503, "service_unavailable"]] as const) {
    let calls = 0;
    const waits: number[] = [];
    const out = await fetchWithRetry("https://ok.example/x", {}, { fetchFn: async (...a) => { calls++; return answer(code, { "retry-after": "4" })(...a); }, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(out.status, status);
    assert.equal(isRefusal(out.status), false);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [4000]);
    assert.ok(describeStatus(out.status, code).includes(String(code)));
  }
});

test("429 then success is a success", async () => {
  let n = 0;
  const out = await fetchWithRetry("https://ok.example/x", {}, { fetchFn: async (...a) => (++n === 1 ? answer(429, { "retry-after": "2" })(...a) : answer(200)(...a)), sleep: nosleep });
  assert.equal(out.status, "success");
});

test("network error is its own status (not blocked)", async () => {
  const out = await fetchWithRetry("https://ok.example/x", {}, { fetchFn: async () => { throw new Error("ENOTFOUND"); }, sleep: nosleep });
  assert.equal(out.status, "temporary_error");
  assert.equal(isRefusal(out.status), false);
  assert.match(describeStatus(out.status, out.http), /^Network error/);
});
