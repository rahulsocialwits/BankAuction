import { parseEauctionsPage } from "./parse";
import { parseEauctionsDetail, type EauctionsDetail } from "./parseDetail";
import { reconcile, COMPLETE_FIELDS, type ReconReport } from "./reconcile";
import { pageSaysMaharashtra, unwrapViewSource } from "./maharashtra";

/*
 * Read-only DEMO report (one self-contained HTML file) built from hand-saved eAuctionsIndia pages: a list page and any saved detail pages.
 * Every number comes from those files (and, only when asked, a read-only database count). Nothing is requested, nothing is written, nothing is
 * invented: a value the saved pages do not contain is shown as "not on the saved page". The headline total is the website's own claim, shown as such.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 36500000 -> "₹3,65,00,000" (Indian grouping). */
export function inr(v: string | number | undefined | null): string {
  const n = Number(v);
  if (!v || !Number.isFinite(n) || n <= 0) return "";
  const s = String(Math.round(n));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `₹${rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : ""}${last3}`;
}

/** ISO (UTC) -> "09 Dec 2026, 2:00 PM IST". */
export function istDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 5.5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const h = d.getUTCHours();
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon} ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} IST`;
}

export interface DemoRow {
  id: string;
  key: string;
  type: string;
  place: string;
  reserve: string;
  auction: string;
  bank: string;
  status: ReconReport["rows"][number]["status"];
  missing: string[];
  mismatches: string[];
  detail: EauctionsDetail | null;
  sourceUrl: string;
}

export interface DemoSummary {
  savedListings: number;
  completeDetails: number;
  incompleteDetails: number;
  invalidDetailFiles: number;
  missingDetails: number;
  duplicates: number;
  detailFiles: number;
  headlineTotal: number | null;
  /** read-only count of eAuctionsIndia auctions stored, or null when the database was not asked */
  databaseCount: number | null;
  saysMaharashtra: boolean;
}

export interface Demo { html: string; summary: DemoSummary; rows: DemoRow[] }

export function buildDemo(listHtml: string, detailHtmls: Array<{ name: string; html: string }>, o: { databaseCount?: number | null; generatedOn?: string } = {}): Demo {
  const list = unwrapViewSource(listHtml);
  const page = parseEauctionsPage(list, "");
  const rep = reconcile([{ name: "list", html: listHtml }], detailHtmls);
  const detailByKey = new Map<string, EauctionsDetail>();
  for (const f of detailHtmls) { const d = parseEauctionsDetail(f.html); if (d.ok && d.id && !detailByKey.has(`src:eauctionsindia.com:${d.id}`)) detailByKey.set(`src:eauctionsindia.com:${d.id}`, d); }

  const rows: DemoRow[] = page.records.map((r) => {
    const key = String(r.external_id);
    const rr = rep.rows.find((x) => x.key === key)!;
    const d = detailByKey.get(key) ?? null;
    return {
      id: key.split(":").pop()!, key, type: String(r.source_property_type ?? ""), place: String(r.location ?? ""),
      reserve: inr(r.reserve_price), auction: istDate(r.auction_start), bank: d?.bank || String(r.bank ?? ""),
      status: rr.status, missing: rr.missingFields, mismatches: rr.mismatches, detail: d, sourceUrl: String(r.source_url ?? ""),
    };
  });

  const summary: DemoSummary = {
    savedListings: rep.listIds, completeDetails: rep.counts.DETAIL_COMPLETE, incompleteDetails: rep.counts.DETAIL_INCOMPLETE, invalidDetailFiles: rep.invalidFiles.length,
    missingDetails: rep.counts.MISSING_DETAIL, duplicates: rep.duplicateListIds + rep.duplicateDetailFiles.length, detailFiles: rep.detailFiles,
    headlineTotal: page.headlineTotal, databaseCount: o.databaseCount ?? null, saysMaharashtra: pageSaysMaharashtra(list),
  };
  return { html: render(rows, summary, o.generatedOn ?? new Date().toISOString().slice(0, 10)), summary, rows };
}

const NA = '<span class="na">not on the saved page</span>';
const cell = (v: string) => (v ? esc(v) : NA);

function render(rows: DemoRow[], s: DemoSummary, on: string): string {
  const badge = (r: DemoRow) =>
    r.status === "DETAIL_COMPLETE" ? '<span class="b ok">Detail complete</span>'
    : r.status === "DETAIL_INCOMPLETE" ? `<span class="b warn">Detail incomplete</span><div class="sm">empty: ${esc(r.missing.join(", "))}</div>`
    : r.status === "DETAIL_INVALID" ? '<span class="b bad">Detail file invalid</span>'
    : '<span class="b miss">Detail page not saved</span>';
  const tr = rows.map((r) => `<tr>
<td><a href="${esc(r.sourceUrl)}" rel="noopener">#${esc(r.id)}</a></td>
<td>${cell(r.type)}<div class="sm">${cell(r.place)}</div></td>
<td class="num">${r.reserve ? esc(r.reserve) : NA}</td>
<td>${r.auction ? esc(r.auction) : '<span class="na">not stated on the saved page</span>'}</td>
<td>${r.bank ? esc(r.bank) : '<span class="na">not on the list card</span>'}</td>
<td>${badge(r)}${r.mismatches.map((m) => `<div class="sm bad-t">MISMATCH: ${esc(m)}</div>`).join("")}</td></tr>`).join("\n");

  const details = rows.filter((r) => r.detail).map((r) => {
    const d = r.detail!;
    const f = (l: string, v: string) => `<div class="f"><span>${l}</span><b>${v ? esc(v) : NA}</b></div>`;
    return `<section class="card"><h3>Property #${esc(d.id ?? "")} — detail page <span class="tag">real saved page</span></h3>
<div class="grid">${f("Title on the site", d.sourceTitle)}${f("Property type", d.propertyType)}${f("Auction type", d.auctionType)}${f("Bank / institution", d.bank)}${f("Branch", d.branch)}${f("Service provider", d.serviceProvider)}
${f("Reserve price", inr(d.reservePrice))}${f("EMD", inr(d.emd))}${f("Auction start", istDate(d.auctionStart))}${f("Auction end", istDate(d.auctionEnd))}${f("Application deadline", istDate(d.applicationDeadline))}
${f("State", d.state)}${f("City", d.city)}${f("Area", d.area)}${f("Pincode (from the description text)", d.pincodeFromDescription)}${f("Borrower named on the page", d.borrower)}</div>
<p class="desc"><b>Description (as on the site):</b> ${esc(d.description)}</p>
<p class="sm">Sale notice links on the page: ${d.noticeLinks.length}. The contact person and phone on the page are deliberately not read or shown.</p></section>`;
  }).join("\n");

  const db = s.databaseCount === null ? "not checked (add --check-database for a read-only count)" : String(s.databaseCount);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BankAuction: Maharashtra sample dataset</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#14202b;--mut:#5b6b7a;--line:#e1e6eb;--ok:#0f7a3d;--okb:#e3f5ea;--warn:#8a5a00;--warnb:#fff3d6;--bad:#b3261e;--badb:#fde8e6;--miss:#44546a;--missb:#e9edf2;--acc:#0b4f8a}
@media (prefers-color-scheme:dark){:root{--bg:#0f151b;--card:#18212a;--fg:#e8eef4;--mut:#9fb0c0;--line:#2a3743;--ok:#6fdc9a;--okb:#143a26;--warn:#f0c15a;--warnb:#3a2e0f;--bad:#ff9a92;--badb:#3d1a18;--miss:#b4c2d1;--missb:#26323d;--acc:#7db8f0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
.banner{background:var(--warnb);color:var(--warn);border:1px solid var(--warn);border-radius:10px;padding:10px 14px;font-weight:600}
h1{font-size:24px;margin:18px 0 4px}h2{font-size:18px;margin:28px 0 10px}h3{font-size:16px;margin:0 0 12px}
.lead{color:var(--mut);margin:0 0 16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.k{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.k b{display:block;font-size:26px;line-height:1.1}.k span{color:var(--mut);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:12px}
.tbl{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}tr:last-child td{border-bottom:0}
.num{white-space:nowrap;font-variant-numeric:tabular-nums}a{color:var(--acc)}
.sm{font-size:12.5px;color:var(--mut)}.na{color:var(--mut);font-style:italic}.bad-t{color:var(--bad)}
.b{display:inline-block;font-size:12.5px;font-weight:600;border-radius:999px;padding:2px 10px}
.ok{background:var(--okb);color:var(--ok)}.warn{background:var(--warnb);color:var(--warn)}.bad{background:var(--badb);color:var(--bad)}.miss{background:var(--missb);color:var(--miss)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px 16px}.f span{display:block;font-size:12px;color:var(--mut)}.f b{font-weight:600}
.tag{font-size:11px;font-weight:600;color:var(--ok);background:var(--okb);border-radius:999px;padding:2px 8px;vertical-align:middle}
.desc{margin:14px 0 6px}ul.notes{margin:8px 0 0;padding-left:20px;color:var(--mut)}
</style></head><body><div class="wrap">
<div class="banner">SAVED-PAGE SAMPLE DATA — not a live feed and not imported into BankAuction. Read-only preview of pages saved by hand on ${esc(on)}.</div>
<h1>Maharashtra bank auctions: sample dataset (eAuctionsIndia)</h1>
<p class="lead">${s.savedListings} listing cards from one saved Maharashtra list page${s.saysMaharashtra ? "" : " (the page does NOT name Maharashtra)"}, with the full detail page for ${s.completeDetails + s.incompleteDetails} of them. Everything below is copied from those pages; a missing value is marked, never filled in.</p>
<div class="cards">
<div class="k"><b>${s.savedListings}</b><span>listing cards on the saved page</span></div>
<div class="k"><b>${s.completeDetails}</b><span>with complete detail page</span></div>
<div class="k"><b>${s.incompleteDetails + s.invalidDetailFiles}</b><span>detail pages incomplete / invalid</span></div>
<div class="k"><b>${s.missingDetails}</b><span>detail pages not saved yet</span></div>
<div class="k"><b>${s.duplicates}</b><span>duplicates found</span></div>
<div class="k"><b>${esc(String(s.databaseCount ?? "n/a"))}</b><span>eAuctionsIndia rows in the database${s.databaseCount === null ? " (not checked)" : ""}</span></div>
</div>
<h2>Listings on the saved page</h2>
<div class="tbl"><table><thead><tr><th>ID</th><th>Property / location</th><th>Reserve price</th><th>Auction date</th><th>Bank / institution</th><th>Detail data</th></tr></thead><tbody>
${tr}
</tbody></table></div>
<h2>Full detail for the saved detail page${s.completeDetails + s.incompleteDetails > 1 ? "s" : ""}</h2>
${details || '<p class="sm">No detail page was saved.</p>'}
<h2>What this is, and is not</h2>
<ul class="notes">
<li>The website itself reports ${s.headlineTotal ? s.headlineTotal.toLocaleString("en-IN") : "a larger number of"} Maharashtra auctions. That is the site's own headline: <b>it is not what BankAuction has collected</b>. This sample covers ${s.savedListings} listings.</li>
<li>Database rows: ${esc(db)}. Nothing in this report was written to the database.</li>
<li>Automated access to the site is answered with a Cloudflare challenge and is not bypassed; these pages were saved by hand in a browser.</li>
<li>Importing is disabled until the operator's written permission covering these pages is confirmed.</li>
<li>Prices and dates are shown as on the site (India time). Fields the saved pages do not contain are shown as "not on the saved page".</li>
</ul>
</div></body></html>`;
}

export { COMPLETE_FIELDS };
