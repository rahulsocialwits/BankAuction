/*
 * Read-only diagnosis of one source address: WHY did a scan find zero pages?
 *   npx tsx scripts/diagnose-source.ts <https://start-url> [more urls…]
 *
 * It follows the same rules as the crawler: the do-not-fetch list, robots.txt, the honest user agent, one polite retry for
 * 429 / 503. It never bypasses robots.txt, HTTP 401 / 403, CAPTCHA or anti-bot screens, and it makes at most two requests per
 * address (robots.txt, the page). It writes nothing anywhere.
 */
import * as cheerio from "cheerio";
import { checkSourceUrl } from "../src/data-sources/feeds/blockedHosts";
import { RobotsGate } from "../src/data-sources/feeds/robotsGate";
import { UA, htmlToText } from "../src/data-sources/feeds/webScan";
import { describeStatus, fetchWithRetry } from "../src/lib/fetch/httpStatus";
import { normalizeUrl, shapeOf } from "../src/data-sources/feeds/siteScan";

async function diagnose(raw: string, gate: RobotsGate) {
  console.log(`\n=== ${raw}`);
  const check = checkSourceUrl(raw);
  if (!check.ok) return console.log(`  source validation : REFUSED (${check.status ?? "invalid"}) ${check.reason}`);
  console.log("  source validation : ok (not on the do-not-fetch list)");
  const robots = await gate.check(check.url);
  console.log(`  robots.txt        : ${robots}${robots === "disallowed" ? "  → request skipped (not bypassed)" : robots === "unreachable" ? "  → no answer from the site; no page request made" : ""}`);
  if (robots !== "allowed") return;

  const out = await fetchWithRetry(check.url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(30_000) }, { onLog: (l) => console.log(`  retry log         : ${l}`) });
  const res = out.res;
  console.log(`  HTTP status       : ${out.http ?? "no answer"}  → classified as ${out.status} (${describeStatus(out.status, out.http)})`);
  if (!res || out.status !== "success") return;
  const html = await res.text();
  console.log(`  final URL         : ${res.url}${res.redirected ? "  (redirected)" : ""}`);
  console.log(`  content-type      : ${res.headers.get("content-type") ?? "?"}`);
  console.log(`  response size     : ${html.length.toLocaleString("en-IN")} chars (${res.headers.get("content-length") ?? "no content-length"})`);

  const $ = cheerio.load(html);
  const text = htmlToText(html);
  const anchors = $("a[href]").toArray().map((a) => normalizeUrl($(a).attr("href") ?? "", res.url)).filter((u): u is string => !!u);
  const sameHost = anchors.filter((u) => new URL(u).hostname.replace(/^www\./, "") === new URL(res.url).hostname.replace(/^www\./, ""));
  const shapes = new Map<string, number>();
  for (const u of new Set(sameHost)) shapes.set(shapeOf(u), (shapes.get(shapeOf(u)) ?? 0) + 1);
  const scripts = $("script[src]").length;
  const inline = $("script:not([src])").toArray().reduce((n, s) => n + ($(s).html()?.length ?? 0), 0);
  const markers = [
    /__NEXT_DATA__/.test(html) && "Next.js",
    /id=["']root["']/.test(html) && "React root",
    /id=["']__nuxt["']|window\.__NUXT__/.test(html) && "Nuxt",
    /ng-version|<app-root/.test(html) && "Angular",
    /data-v-app|id=["']app["']/.test(html) && "Vue",
    /__doPostBack|__VIEWSTATE/.test(html) && "ASP.NET WebForms (postback)",
    /\/wp-content\//.test(html) && "WordPress",
    /DataTable|datatables/i.test(html) && "DataTables (rows loaded by script)",
  ].filter(Boolean);
  console.log(`  <title>           : ${$("title").first().text().trim().slice(0, 90) || "—"}`);
  console.log(`  visible text      : ${text.length.toLocaleString("en-IN")} chars   headings: h1=${$("h1").length} h2=${$("h2").length}`);
  console.log(`  links             : ${anchors.length} total, ${sameHost.length} on this site;  script files: ${scripts}, inline script: ${inline.toLocaleString("en-IN")} chars`);
  console.log(`  framework hints   : ${markers.join(", ") || "none"}`);
  console.log(`  property words    : reserve=${(text.match(/reserve\s*price/gi) ?? []).length} emd=${(text.match(/\bemd\b|earnest/gi) ?? []).length} auction=${(text.match(/auction/gi) ?? []).length} ₹/Rs=${(text.match(/₹|\brs\.?\s?\d/gi) ?? []).length}`);
  console.log(`  address shapes    : ${[...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s}×${n}`).join("  ") || "none"}`);

  const shell = text.length < 1500 && (scripts >= 3 || inline > 20_000 || markers.length > 0);
  const hasListingWords = /reserve\s*price|\bemd\b/i.test(text);
  const verdict = shell
    ? "JAVASCRIPT-RENDERED PAGE: the HTML we receive is an empty shell (very little visible text, many scripts). The listings are loaded by the browser afterwards, so \"0 listings\" says NOTHING about how many properties the website has. A plain fetch cannot see them; they need a rendering step (or the bank's own notice / feed)."
    : !hasListingWords && sameHost.length < 5
      ? "THIN PAGE: the page loaded normally but shows no listings and few links (a menu / landing page). The listings are probably on other pages or behind a search form / POST request."
      : hasListingWords
        ? "LISTINGS ARE IN THE HTML: the page carries property words. If a scan still found nothing, the cause is in link discovery / extraction, not access."
        : "NO LISTING WORDS in the HTML text, but the page has many links: check the address shapes above.";
  console.log(`  ROOT CAUSE HINT   : ${verdict}`);
}

(async () => {
  const urls = process.argv.slice(2);
  if (!urls.length) return console.log("usage: npx tsx scripts/diagnose-source.ts <https://url> [...]");
  const gate = new RobotsGate();
  for (const u of urls) await diagnose(u, gate).catch((e) => console.log(`  ERROR: ${e instanceof Error ? e.message : e}`));
  process.exit(0);
})();
