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

// ---- FindAuction.in: forbidden as a source of any kind --------------------------------------------------------------------

import { isBlockedRecord, isBlockedUrl } from "../src/data-sources/feeds/blockedHosts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("REGRESSION: findauction.in and its sub-domains are on the do-not-fetch list", () => {
  assert.ok(BLOCKED_HOSTS.includes("findauction.in"));
  for (const h of ["findauction.in", "www.findauction.in", "api.findauction.in", "WWW.FINDAUCTION.IN".toLowerCase()]) assert.equal(denylistMatch(h), "findauction.in", h);
});

test("REGRESSION: a FindAuction link can never be added as a link source (any page, any case, with or without www)", () => {
  for (const url of ["https://findauction.in/", "https://www.findauction.in/auction/123", "https://FindAuction.in/search?city=pune", "https://sub.findauction.in/x", "  https://findauction.in/  "]) {
    const r = checkSourceUrl(url);
    assert.equal(r.ok, false, url);
    if (!r.ok) {
      assert.equal(r.status, "internal_policy_block", url);
      assert.ok(r.reason.startsWith(POLICY_PREFIX), r.reason);
    }
  }
});

test("lookalike hosts are not caught by mistake", () => {
  for (const h of ["notfindauction.in", "findauction.in.example.com", "findauctions.in", "bankauctions.in"]) assert.equal(denylistMatch(h), null, h);
  assert.equal(checkSourceUrl("https://findauction.in.example.com/").ok, true);
});

test("REGRESSION: a record that comes from FindAuction is blocked however it arrives", () => {
  assert.equal(isBlockedRecord({ source_url: "https://www.findauction.in/auction/9" }), true, "own source address");
  assert.equal(isBlockedRecord({ external_id: "src:findauction.in:9" }), true, "source-qualified id");
  assert.equal(isBlockedRecord({ external_id: "src:FindAuction.in:9" }), true, "id in another case");
  assert.equal(isBlockedRecord({ source_url: "https://example-bank.in/a" }, "https://findauction.in/list"), true, "the import was started from FindAuction");
  assert.equal(isBlockedRecord({ source_url: "https://auctionbazaar.com/x" }), true, "the older entries keep working");
});

test("ordinary records are not blocked", () => {
  assert.equal(isBlockedRecord({ source_url: "https://bankauctions.in/auction/1", external_id: "src:bankauctions.in:1" }), false);
  assert.equal(isBlockedRecord({ source_url: "https://baanknet.com/x", external_id: "src:baanknet.com:7" }, "https://docs.google.com/spreadsheets/d/abc"), false);
  assert.equal(isBlockedRecord({}), false);
  assert.equal(isBlockedRecord({ source_url: 42, external_id: null }, null), false);
  assert.equal(isBlockedUrl("not a url"), false);
});

test("the shared write path (importRecords) applies the do-not-fetch list before anything else is stored", () => {
  const src = readFileSync(join(__dirname, "..", "src/lib/import/csvImport.ts"), "utf8");
  const gate = src.indexOf("isBlockedRecord(rec, sourceUrl)");
  assert.ok(gate > 0, "gate present");
  assert.ok(gate < src.indexOf("Quality gate:"), "gate runs before the quality gate, the bank lookup and every write");
  assert.ok(gate < src.indexOf("resolveBank(bankName)"), "no bank row is created for a blocked record");
});

test("the existing record-level and fetch-level checks are still in place", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  assert.match(read("src/lib/import/tabular.ts"), /isBlockedUrl\(u\)/);
  assert.match(read("src/data-sources/feeds/deepScan.ts"), /isBlockedUrl\(url\)\) return fail\("internal_policy_block"\)/);
  assert.match(read("src/data-sources/feeds/run.ts"), /checkSourceUrl\(raw\)/);
});
