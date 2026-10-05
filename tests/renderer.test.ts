import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BrowserRenderer, type RenderGate } from "../src/lib/scrapDemo/browser";
import { isJsShell } from "../src/data-sources/feeds/render";
import { parseRenderedProperty } from "../src/data-sources/feeds/renderedParser";

/*
 * Browser-renderer tests against a LOCAL single-page app that behaves like the real one:
 *   /                 list page: the cards are drawn by JavaScript after the page loads
 *   /detail/1         typed in directly: the app shows only an empty state (no property)
 *   /detail/1/abc123  reached by CLICKING the card: the app draws the full property
 *   /forbidden        HTTP 403 (a refusal: must stop, not be worked around)
 *   /captcha          a small "verification" screen with HTTP 200 (must stop)
 *   /data-blocked     a page whose script asks for /api/secret, which robots.txt disallows (the request must not be made)
 * The tests are skipped when no Chromium / Chrome / Edge is installed on the machine.
 */

const DETAIL_LINES = `Property ID
TESTBANK12345
Individual House for sale in Guntur
Bank
Test Bank
Auction ID
900001
Reserve price
₹12,50,000.00
EMD Amount
₹1,25,000.00
Auction Start Date & Time
10-11-2026 11:00:00
Property Address
Flat 4, Green Park, Guntur, Andhra Pradesh in an area admeasuring 120 square yards with a boundary on every side and a road
City
Guntur
State
Andhra Pradesh
Pin Code
522007
Borrower's Name
TEST BORROWER`;

const APP = `<!doctype html><html><head><title></title></head><body><div id="root"></div><script>
const DETAIL = ${JSON.stringify(DETAIL_LINES)};
function show(html){ document.getElementById('root').innerHTML = html; }
function render(){
  const p = location.pathname;
  if (p === '/') setTimeout(() => { show('<h1>Auctions</h1>' + [1,2].map(n => '<a class="card" href="/detail/'+n+'">Card '+n+'</a>').join('<br>') + '<p>' + 'Browse the latest bank auctions on this portal today. '.repeat(6) + '</p>'); bind(); }, 250);
  else if (/^\\/detail\\/\\d+\\/\\w+$/.test(p)) setTimeout(() => show('<pre style="white-space:pre-wrap">' + DETAIL + '</pre>'), 250);
  else setTimeout(() => show('<h2>Not sure what to do next?</h2><p>Go to Home</p><p>' + 'Browse Auctions and find your next opportunity. '.repeat(6) + '</p>'), 250);
}
function bind(){ document.querySelectorAll('a.card').forEach(a => a.addEventListener('click', e => { e.preventDefault(); history.pushState(null, '', a.getAttribute('href') + '/abc123'); render(); })); }
window.addEventListener('popstate', render);
render();
</script></body></html>`;

let server: Server;
let base = "";
let apiSecretRequested = false;
let available = false;

test.before(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/forbidden") { res.writeHead(403, { "content-type": "text/html" }); return res.end("<html>Forbidden</html>"); }
    if (path === "/captcha") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><head><title>Just a moment...</title></head><body>Verify you are human <div class='cf-turnstile'></div></body></html>"); }
    if (path === "/api/secret") { apiSecretRequested = true; res.writeHead(200, { "content-type": "application/json" }); return res.end("{}"); }
    if (path === "/data-blocked") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><body><div id='root'></div><script>fetch('/api/secret'); setTimeout(()=>{document.getElementById('root').innerText='loaded '.repeat(60)},300)</script></body></html>"); }
    if (path === "/robots.txt") { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(APP);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const probe = new BrowserRenderer();
  available = (await probe.status()).ok;
  await probe.close(); // the probe's browser must not keep the test process alive
});

test.after(() => { server.close(); });

const gate = (): RenderGate => ({
  sameFamily: (u) => u.startsWith(base),
  robotsFor: async (u) => (new URL(u).pathname.startsWith("/api/secret") ? "disallowed" : "allowed"),
  consume: () => undefined,
});

test("a JavaScript shell is detected from the plain HTML, then rendered into real content", async (t) => {
  if (!available) return t.skip("no browser installed");
  const plain = await (await fetch(base + "/")).text();
  assert.equal(isJsShell(plain).shell, true);
  const b = new BrowserRenderer();
  try {
    const r = await b.render(base + "/", gate());
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.match(r.text, /Card 1/);
      assert.match(r.html, /href="\/detail\/1"/);
    }
  } finally { await b.close(); }
});

test("typing a detail address directly shows only the app's empty state (why a plain render is not enough)", async (t) => {
  if (!available) return t.skip("no browser installed");
  const b = new BrowserRenderer();
  try {
    const r = await b.render(base + "/detail/1", gate());
    assert.equal(r.ok, true);
    if (r.ok) assert.match(r.text, /Not sure what to do next/);
  } finally { await b.close(); }
});

test("click-through render: the card is clicked like a visitor and the full property is read and parsed", async (t) => {
  if (!available) return t.skip("no browser installed");
  const b = new BrowserRenderer();
  try {
    const r = await b.renderLinked(base + "/", base + "/detail/1", gate());
    assert.equal(r.ok, true, JSON.stringify(r));
    if (!r.ok) return;
    assert.match(r.finalUrl, /\/detail\/1\/abc123$/);
    const p = parseRenderedProperty(r.html, base + "/detail/1", r.text);
    assert.equal(p.title, "Individual House for sale in Guntur");
    assert.equal(p.reservePrice, 1250000);
    assert.equal(p.emd, 125000);
    assert.equal(p.auctionStart, "2026-11-10T11:00:00");
    assert.equal(p.borrowerName, "TEST BORROWER");
    assert.equal(p.city, "Guntur");
    // a second card from the same list page works too (the page keeps its list between reads)
    const r2 = await b.renderLinked(base + "/", base + "/detail/2", gate());
    assert.equal(r2.ok, true, JSON.stringify(r2));
  } finally { await b.close(); }
});

test("a card that is not on the list page is reported as link_not_found, not as a block", async (t) => {
  if (!available) return t.skip("no browser installed");
  const b = new BrowserRenderer();
  try {
    const r = await b.renderLinked(base + "/", base + "/detail/99", gate());
    assert.equal(r.ok, false);
    if (!r.ok) { assert.equal(r.kind, "FAILED"); assert.match(r.reason, /link_not_found/); }
  } finally { await b.close(); }
});

test("HTTP 403 in the browser STOPS as a refusal (not retried, not worked around)", async (t) => {
  if (!available) return t.skip("no browser installed");
  const b = new BrowserRenderer();
  try {
    const r = await b.render(base + "/forbidden", gate());
    assert.equal(r.ok, false);
    if (!r.ok) { assert.equal(r.kind, "REFUSED"); assert.match(r.reason, /HTTP 403/); }
  } finally { await b.close(); }
});

test("a CAPTCHA / verification screen STOPS as a refusal", async (t) => {
  if (!available) return t.skip("no browser installed");
  const b = new BrowserRenderer();
  try {
    const r = await b.render(base + "/captcha", gate());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "REFUSED");
  } finally { await b.close(); }
});

test("a data request that robots.txt disallows is NOT made by the browser", async (t) => {
  if (!available) return t.skip("no browser installed");
  apiSecretRequested = false;
  const b = new BrowserRenderer();
  try {
    const r = await b.render(base + "/data-blocked", gate());
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.blocked.some((x) => /robots\.txt: \/api\/secret/.test(x)), JSON.stringify(r.blocked));
    assert.equal(apiSecretRequested, false);
  } finally { await b.close(); }
});
