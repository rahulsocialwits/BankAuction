/* Maharashtra-only validator and the two import gates (verified institution + verified Maharashtra location). Real fixtures where a real page exists; inputs for the
 * other cases are hand-written location strings (SYNTHETIC) because no real page for those places exists in the repository. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pincodeInMaharashtra, validateMaharashtra } from "../src/data-sources/eauctionsindia/maharashtraLocation";
import { buildMapping, evidenceFromHtml } from "../src/data-sources/eauctionsindia/institutions";
import { collectFromHtml } from "../src/data-sources/eauctionsindia/bulkPipeline";
import { parseEauctionsPage } from "../src/data-sources/eauctionsindia/parse";
import { qualify } from "../src/data-sources/eauctionsindia/qualify";

const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, "utf8");
const list = fx("eauctionsindia-maharashtra-page1.html");
const detail = fx("eauctionsindia-detail-894455.html");
const residential = fx("eauctionsindia-residential-page1.html");
const v = (i: Parameters<typeof validateMaharashtra>[0]) => validateMaharashtra(i).verdict;

test("accepted: Mumbai, Pune and Nashik properties that state Maharashtra", () => {
  assert.equal(v({ state: "Maharashtra", city: "Mumbai", area: "Borivali" }), "accept");
  assert.equal(v({ state: "maharashtra", city: "Pune", area: "Haveli" }), "accept");
  assert.equal(v({ state: "Maharashtra", city: "Nashik" }), "accept");
});

test("accepted without a state field only when the district / city is unambiguously Maharashtra (list cards: 'Palus., Sangli')", () => {
  assert.equal(v({ city: "Sangli", area: "Palus", address: "Palus., Sangli" }), "accept");
  assert.equal(v({ city: "Mumbai", address: "Khar West, Mumbai" }), "accept");
  assert.equal(v({ address: "Plot 4, Kupwad, Sangli, Maharashtra 416436" }), "accept");
});

test("rejected: Gujarat, Karnataka and other states", () => {
  assert.equal(v({ state: "Gujarat", city: "Ahmedabad" }), "reject");
  assert.equal(v({ state: "Karnataka", city: "Bengaluru" }), "reject");
  assert.equal(v({ state: "Telangana", city: "Hyderabad" }), "reject");
  assert.equal(v({ state: "Goa", city: "Panaji" }), "reject");
  assert.equal(v({ city: "Surat", address: "Adajan, Surat, Gujarat 395009" }), "reject");
});

test("a bank headquartered in Maharashtra, or an auction office in Maharashtra, does not make an out-of-state asset Maharashtra", () => {
  // the bank / branch / office are not even inputs of the validator: only the property's own location counts
  assert.equal(v({ state: "Gujarat", city: "Ahmedabad", address: "Plot in Ahmedabad. Bank HQ Mumbai, Maharashtra" }), "reject");
  assert.equal(v({ state: "Karnataka", city: "Bengaluru", address: "Auction office: Mumbai, Maharashtra" }), "reject"); // the state field decides
  assert.equal(validateMaharashtra({ city: "Bengaluru", address: "Flat in Bengaluru, Karnataka. Auction conducted from the Mumbai, Maharashtra office" }).verdict, "review"); // conflicting text: not imported
  assert.equal(v({ city: "Hyderabad", area: "Ghatkesar", address: "Ghatkesar, Hyderabad" }), "review"); // a Mumbai branch does not matter; no Maharashtra evidence
});

test("missing, ambiguous and conflicting evidence is review, never accept", () => {
  assert.equal(v({}), "review");
  assert.equal(v({ address: "Flat no 4, Shanti Nagar" }), "review");
  assert.equal(v({ state: "Maharashtra", city: "Pune", pincode: "500001" }), "review"); // Hyderabad PIN with a Maharashtra state
  assert.equal(v({ state: "Maharashtra", city: "Mumbai", address: "Mumbai and Surat, Gujarat" }), "review");
  assert.equal(v({ city: "Aurangabad" }), "review"); // Aurangabad exists in Maharashtra and in Bihar
  assert.equal(v({ city: "Aurangabad", pincode: "431001" }), "accept"); // the PIN settles it
  assert.equal(v({ state: "Bihar", city: "Aurangabad" }), "reject");
  assert.equal(validateMaharashtra({ city: "Aurangabad" }).reasons.join(" ").includes("more than one state"), true);
});

test("PIN codes: Maharashtra is 400-402 and 404-445; Goa 403 and other states are not; a lot number is not read as a PIN", () => {
  assert.equal(pincodeInMaharashtra("416 310"), true);
  assert.equal(pincodeInMaharashtra("400001"), true);
  assert.equal(pincodeInMaharashtra("445001"), true);
  assert.equal(pincodeInMaharashtra("403001"), false);
  assert.equal(pincodeInMaharashtra("380001"), false);
  assert.equal(pincodeInMaharashtra("12345"), null);
  assert.equal(v({ address: "Survey no 245 678, Plot in Dhule" }), "accept"); // Dhule (a district) is the evidence; "245 678" is not a PIN
  assert.equal(v({ address: "Gat no 245 678" }), "review");
  assert.equal(v({ address: "Plot, Pincode-416 310" }), "review"); // a Maharashtra PIN alone is not enough (no state, no district): conservative
});

test("real detail page 894455: state Maharashtra on the page itself -> accept (its branch is Mumbai, which is not used)", () => {
  const c = collectFromHtml([{ name: "d.html", html: detail }]);
  const r = c.records.get("src:eauctionsindia.com:894455")!;
  assert.equal(v({ state: String(r.geo_state), city: String(r.geo_city), area: String(r.geo_locality), address: `${r.location} ${r.description}` }), "accept");
});

const evidence = [...evidenceFromHtml(list, "p1"), ...evidenceFromHtml(residential, "res"), ...evidenceFromHtml(detail, "detail")];
const mapping = buildMapping(evidence, { directoryComplete: false, directoryFiles: [] });

test("gates on the real pages: verified institution + verified Maharashtra location qualify; no institution is excluded; the page tag alone proves nothing", () => {
  const c = collectFromHtml([{ name: "p1.html", html: list }, { name: "d.html", html: detail }]);
  const q = qualify(c, mapping);
  assert.equal(q.counts.parsed, 12);
  const noBank = q.excluded.filter((x) => x.reason === "institution_unknown");
  assert.ok(noBank.length >= 1 && noBank.every((x) => x.bank === ""));
  assert.ok(q.records.has("src:eauctionsindia.com:894455")); // DRT (verified) + state on the detail page
  assert.ok(q.hasDetail.has("src:eauctionsindia.com:894455"));
  assert.equal(q.counts.qualified + q.excluded.length, 12);
  for (const rec of q.records.values()) assert.ok(["Debts Recovery Tribunal", "Axis Bank", "Union Bank of India", "Bank of Baroda"].includes(String(rec.bank)));
});

test("a Hyderabad listing with a verified institution is NOT imported as Maharashtra even if it was found on a page tagged Maharashtra", () => {
  const hyd = parseEauctionsPage(residential, "").records; // real cards: Ghatkesar/Keesara/LB Nagar (Hyderabad), Hoshiarpur
  const c = collectFromHtml([], { listRecords: hyd });
  assert.equal(c.records.size, 4);
  const q = qualify(c, mapping, { checkInstitution: false });
  assert.equal(q.records.size, 0);
  assert.ok(q.excluded.every((x) => x.reason === "location_review" || x.reason === "location_rejected"));
  assert.equal(q.counts.maharashtraVerified, 0);
});

test("an institution that is not verified is excluded and named in the log", () => {
  const rec = { external_id: "src:eauctionsindia.com:1", bank: "HDFC Bank", location: "Dadar, Mumbai", geo_city: "Mumbai", geo_locality: "Dadar", reserve_price: "100", title: "Flat for sale in Dadar, Mumbai" };
  const c = collectFromHtml([], { listRecords: [rec] });
  const q = qualify(c, mapping);
  assert.equal(q.records.size, 0);
  assert.equal(q.excluded[0].reason, "institution_not_verified");
  assert.match(q.excluded[0].detail, /HDFC Bank/);
  assert.equal(qualify(c, mapping, { checkInstitution: false }).records.size, 1); // the explicit override
});
