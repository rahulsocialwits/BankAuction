/* REAL-DATA fixture: tests/fixtures/eauctionsindia-detail-894455.html is the page https://www.eauctionsindia.com/properties/894455 saved by the user
 * (unwrapped from view-source; csrf token and the contact person/phone redacted). One page: nothing here proves a live-site run. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEauctionsDetail } from "../src/data-sources/eauctionsindia/parseDetail";
import { parseEauctionsPage } from "../src/data-sources/eauctionsindia/parse";
import { planDetailFiles } from "../src/data-sources/eauctionsindia/detailFile";
import { writeLocalImport } from "../src/data-sources/eauctionsindia/localFile";

const html = readFileSync("tests/fixtures/eauctionsindia-detail-894455.html", "utf8");
const listHtml = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");

test("real detail page: id, canonical URL, state, city, area, bank, branch, service provider, borrower", () => {
  const d = parseEauctionsDetail(html);
  assert.equal(d.ok, true);
  assert.deepEqual(d.errors, []);
  assert.equal(d.id, "894455");
  assert.equal(d.canonicalUrl, "https://www.eauctionsindia.com/properties/894455");
  assert.equal(d.state, "Maharashtra");
  assert.equal(d.city, "Sangli");
  assert.equal(d.area, "Palus.");
  assert.equal(d.bank, "Debts Recovery Tribunal");
  assert.equal(d.branch, "Mumbai");
  assert.equal(d.serviceProvider, "bankeauctions.com / C1 India");
  assert.equal(d.propertyType, "Plot");
  assert.equal(d.assetCategory, "Residential");
  assert.equal(d.auctionType, "DRT Auction");
  assert.match(d.sourceTitle, /Plot Auction in Palus\., Sangli/);
});

test("real detail page: reserve price 36500000, EMD 3650000, dates in India time converted to UTC, original text kept", () => {
  const d = parseEauctionsDetail(html);
  assert.equal(d.reservePrice, "36500000");
  assert.equal(d.emd, "3650000");
  assert.equal(d.auctionStart, "2026-12-09T08:30:00.000Z"); // 09-12-2026 02:00 PM IST
  assert.equal(d.auctionEnd, "2026-12-09T10:30:00.000Z"); // 04:00 PM IST
  assert.equal(d.applicationDeadline, "2026-12-07T11:00:00.000Z"); // 07-12-2026 04:30 PM IST
  assert.equal(d.raw.reservePrice, "₹3,65,00,000.00");
  assert.equal(d.raw.emd, "₹36,50,000.00");
  assert.equal(d.raw.auctionStart, "09-12-2026 02:00 PM");
});

test("real detail page: description, pincode only from the description text, sale notice link, contact not read", () => {
  const d = parseEauctionsDetail(html);
  assert.match(d.description, /^Gat no\. 2454/);
  assert.equal(d.pincodeFromDescription, "416310");
  assert.equal(d.noticeLinks.length, 1);
  assert.equal(d.contactPresent, true);
  const rec = JSON.stringify(d.record);
  assert.ok(!/REDACTED|Mobile|98600/.test(rec)); // no contact person or phone goes into the record
  assert.equal(d.record!.officer_name, undefined);
  assert.equal(d.record!.officer_phone, undefined);
});

test("detail record: source id, URL, category, and it matches the same listing on the list page (same id, title, place, price)", () => {
  const d = parseEauctionsDetail(html);
  const r = d.record!;
  assert.equal(r.external_id, "src:eauctionsindia.com:894455");
  assert.equal(r.source_url, "https://www.eauctionsindia.com/properties/894455");
  assert.equal(r.category, "LAND_PLOT");
  assert.equal(r.geo_state, "Maharashtra");
  assert.equal(r.geo_city, "Sangli");
  assert.equal(r.emd, "3650000");
  const l = parseEauctionsPage(listHtml, "").records.find((x) => x.external_id === r.external_id)!;
  assert.equal(r.title, l.title);
  assert.equal(r.location, l.location);
  assert.equal(r.reserve_price, l.reserve_price);
  assert.equal(r.auction_start, l.auction_start);
  assert.equal(r.bank, l.bank);
});

test("a field the page does not contain stays empty, never invented", () => {
  const noEmd = html.replace(/<strong class="mr-2">EMD : <\/strong>\s*<span>[^<]*<\/span>/, "").replace(/Branch Name : /, "Something Else : ");
  const d = parseEauctionsDetail(noEmd);
  assert.equal(d.ok, true);
  assert.equal(d.emd, "");
  assert.equal(d.branch, "");
  assert.equal(d.record!.emd, "");
});

test("no reserve price or no id: invalid, no record", () => {
  const noPrice = parseEauctionsDetail(html.replace(/₹3,65,00,000\.00/, "Contact the bank"));
  assert.equal(noPrice.ok, false);
  assert.equal(noPrice.record, null);
  const noId = parseEauctionsDetail(html.replace(/Auction ID\s*:#\s*894455/, "Auction"));
  assert.equal(noId.ok, false);
  assert.ok(noId.errors.some((e) => /Auction ID/.test(e)));
});

test("wrong source URL: a canonical address of another id or another site is rejected", () => {
  const otherId = parseEauctionsDetail(html.replace('rel="canonical" href="https://www.eauctionsindia.com/properties/894455"', 'rel="canonical" href="https://www.eauctionsindia.com/properties/111111"'));
  assert.equal(otherId.ok, false);
  assert.ok(otherId.errors.some((e) => /does not match the canonical/.test(e)));
  const otherSite = parseEauctionsDetail(html.replace('href="https://www.eauctionsindia.com/properties/894455">', 'href="https://evil.example.com/properties/894455">'));
  assert.equal(otherSite.ok, false);
  assert.equal(otherSite.record, null);
});

test("malformed, empty and challenge pages never throw and give no record", () => {
  for (const bad of ["", "   ", "<html><body><div", html.slice(0, 3000), "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>"]) {
    const d = parseEauctionsDetail(bad);
    assert.equal(d.ok, false);
    assert.equal(d.record, null);
    assert.ok(d.errors.length > 0);
  }
  assert.match(parseEauctionsDetail("<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>").errors[0], /challenge/);
});

test("the fixture holds no session token and no contact person or phone", () => {
  assert.match(html, /csrf-token" content="REDACTED"/);
  assert.ok(!/8sRAn1Ib|Dongaonkar|9860034984/.test(html));
});

test("planning several saved files: duplicates by source id, invalid and wrong-state files reported, limit applied, nothing written", async () => {
  const other = html.replace(/894455/g, "900001").replace(/Sangli/g, "Pune");
  const delhi = html.replace(/894455/g, "900002").replace(/>Maharashtra</, ">Delhi<");
  const plan = await planDetailFiles([
    { name: "a.html", html }, { name: "b.html", html }, { name: "c.html", html: other }, { name: "d.html", html: delhi }, { name: "e.html", html: "<html" },
  ]);
  assert.equal(plan.valid, 2);
  assert.equal(plan.toSend.length, 2);
  assert.equal(plan.duplicatesAmongFiles, 1);
  assert.equal(plan.invalid, 2);
  assert.equal(plan.files[1].duplicateOf, "a.html");
  assert.ok(plan.files[3].detail.errors.some((e) => /not Maharashtra/.test(e)));
  assert.equal(plan.limit, 12);
  assert.equal((await planDetailFiles([{ name: "a", html }, { name: "c", html: other }], { limit: 1 })).overLimit, 1);
});

test("duplicate status uses a read-only lookup; 'not checked' without one", async () => {
  const p = await planDetailFiles([{ name: "a", html }], { existingIds: async (ids) => ids });
  assert.deepEqual(p.alreadyInDatabase, ["src:eauctionsindia.com:894455"]);
  assert.equal(p.newToDatabase, 0);
  assert.equal((await planDetailFiles([{ name: "a", html }])).alreadyInDatabase, null);
});

test("detail import is gated exactly like the list-file import: no flag, authorization, note or scope means the importer is never called", async () => {
  const plan = await planDetailFiles([{ name: "a", html }]);
  const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };
  for (const [env, flag] of [[{}, true], [OK, true], [{ ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, false]] as const) {
    let calls = 0;
    const w = await writeLocalImport(plan, env, flag, async (r) => { calls++; return { created: r.length, updated: 0, skipped: 0, failed: 0 }; });
    assert.equal(w.written, false);
    assert.equal(calls, 0);
  }
  let sent = 0;
  const ok = await writeLocalImport(plan, { ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, true, async (r) => { sent = r.length; return { created: r.length, updated: 0, skipped: 0, failed: 0 }; });
  assert.equal(ok.written, true);
  assert.equal(sent, 1);
});
