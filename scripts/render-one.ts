/*
 * ONE listing, end to end, nothing imported:  normal fetch -> JS-shell check -> browser render -> rendered text -> parse -> JSON.
 *   npx tsx scripts/render-one.ts <detail-url> [--dump]
 * Same rules as the crawler (do-not-fetch list, robots.txt, honest user agent). Writes nothing to the database.
 */
import { checkSourceUrl } from "../src/data-sources/feeds/blockedHosts";
import { RobotsGate } from "../src/data-sources/feeds/robotsGate";
import { UA, htmlToText } from "../src/data-sources/feeds/webScan";
import { RenderingFetcher, isJsShell } from "../src/data-sources/feeds/render";
import { fetchWithRetry, describeStatus } from "../src/lib/fetch/httpStatus";
import { parseRenderedProperty } from "../src/data-sources/feeds/renderedParser";

(async () => {
  const url = process.argv[2];
  const via = process.argv.includes("--via") ? process.argv[process.argv.indexOf("--via") + 1] : null;
  const dump = process.argv.includes("--dump");
  if (!url) return console.log("usage: npx tsx scripts/render-one.ts <detail-url> [--via <list-page-url>] [--dump]");
  const check = checkSourceUrl(url);
  if (!check.ok) return console.log("REFUSED:", check.reason);
  const gate = new RobotsGate();
  console.log("robots.txt:", await gate.check(url));
  const out = await fetchWithRetry(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  console.log(`plain fetch: HTTP ${out.http} → ${out.status} (${describeStatus(out.status, out.http)})`);
  if (!out.res || out.status !== "success") return;
  const html = await out.res.text();
  const shell = isJsShell(html);
  console.log(`plain HTML: ${html.length} chars, visible text ${htmlToText(html).length} chars → JS shell: ${shell.shell} (${shell.why})`);
  let finalHtml = html;
  let finalText: string | undefined;
  const renderer = new RenderingFetcher(gate);
  try {
    if (shell.shell) {
      console.log("browser:", JSON.stringify(await renderer.status()));
      const r = via ? await renderer.renderLinked(via, url) : await renderer.render(url);
      if (!r.ok) return console.log(`RENDER FAILED: ${r.failure} — ${r.reason}`);
      finalHtml = r.page.html;
      finalText = r.page.text;
      console.log(`rendered in ${r.page.ms} ms: ${finalHtml.length} chars, visible text ${htmlToText(finalHtml).length} chars, final URL ${r.page.finalUrl}`);
    }
    if (dump) console.log("\n----- rendered text -----\n" + htmlToText(finalHtml).slice(0, 6000) + "\n-------------------------");
    const parsed = parseRenderedProperty(finalHtml, url, finalText);
    console.log("\nNORMALIZED PROPERTY:\n" + JSON.stringify(parsed, null, 2));
  } finally {
    await renderer.close();
  }
  process.exit(0);
})();

