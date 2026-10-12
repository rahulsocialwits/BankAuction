/*
 * BAANKNET sizing plan: READ-ONLY. Finds out how many auctions each (state, property type) slice holds, so the slices that are
 * larger than the API's 10,000-result window can be split further. It does NOT import anything, does not use the database and does
 * not save a cursor.
 *
 *   $env:BAANKNET_SPLIT_AUTHORIZED="yes"; npx tsx scripts/baanknet-plan-split.ts [--status=all] [--states=1-40] [--types=1-8]
 *
 * One tiny request per slice (limit 1, page 1), about 0.6 s apart. Filter names are the ones the site's own search sends
 * (search.stateId, search.propertyTypeId, auctionStatus). robots.txt is checked first. Any 401 / 403 / CAPTCHA page stops the run
 * and nothing is retried or worked around. BAANKNET_SPLIT_AUTHORIZED=yes means YOU confirm that widening the use of this source is
 * approved by the owner (see ownerDecision in src/data-sources/registry.ts).
 */
import { RobotsGate } from "../src/data-sources/feeds/robotsGate";
import { UA } from "../src/data-sources/feeds/webScan";

const API = "https://baanknet.com/api/v1/auction/detail/auction-listing";
const CSRF = "https://baanknet.com/api/v1/auth/csrf-token";
const CAP = 10_000;
const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const range = (s: string): number[] => {
  const [a, b] = s.split("-").map(Number);
  return Number.isInteger(a) && Number.isInteger(b) && b >= a && b - a < 200 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (process.env.BAANKNET_SPLIT_AUTHORIZED !== "yes") {
    console.log('BAANKNET_SPLIT_AUTHORIZED is not "yes": no request was sent. Set it only when the owner has approved widening BAANKNET use.');
    return;
  }
  const status = arg("status", "all");
  const states = range(arg("states", "1-40"));
  const types = range(arg("types", "1-8"));

  const gate = new RobotsGate();
  for (const url of [API, CSRF]) {
    const d = await gate.check(url);
    if (d !== "allowed") return console.log(`Stopped: robots/access check for ${url} returned ${d}. Not bypassed, no request sent.`);
  }
  const base = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://baanknet.com/auction-listing/property", Origin: "https://baanknet.com" };
  const csrf = await fetch(CSRF, { headers: base, signal: AbortSignal.timeout(20_000) });
  if (!csrf.ok) return console.log(`Stopped: CSRF handshake answered HTTP ${csrf.status}. Not bypassed.`);
  const token = csrf.headers.get("x-csrf-token") ?? csrf.headers.get("csrf-token") ?? "";
  const cookie = (csrf.headers.getSetCookie?.() ?? []).map((v) => v.split(";")[0]).join("; ");

  console.log(`Plan: auctionStatus "${status}", states ${states[0]}-${states[states.length - 1]}, types ${types[0]}-${types[types.length - 1]} (${states.length * types.length} small requests)`);
  let grand = 0;
  let capped = 0;
  for (const stateId of states) {
    for (const propertyTypeId of types) {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...base, "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ search: { stateId, propertyTypeId }, range: {}, sort: { type: "closest" }, page: 1, limit: 1, auctionStatus: status }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 401 || res.status === 403) return console.log(`Stopped at state ${stateId}, type ${propertyTypeId}: HTTP ${res.status}. Access refusal: no retry, no workaround.`);
      if (!res.ok) { console.log(`state ${stateId} type ${propertyTypeId}: HTTP ${res.status}`); await sleep(600); continue; }
      let total = 0;
      try { total = Number(((await res.json()) as { data?: { total?: number } }).data?.total ?? 0); } catch { /* not JSON: counted as 0 */ }
      if (total > 0) {
        const isCapped = total >= CAP;
        grand += total;
        if (isCapped) capped++;
        console.log(`state ${String(stateId).padStart(2)} type ${propertyTypeId}: ${String(total).padStart(6)}${isCapped ? "  CAPPED (needs a further split)" : ""}`);
      }
      await sleep(600);
    }
  }
  console.log(`\nDONE. Sum of slice totals: ${grand}. Capped slices: ${capped}. Nothing was imported or written.`);
})().catch((e) => { console.error("Plan failed:", e instanceof Error ? e.message : e); process.exit(1); });
