/* Owner fixes of 14 Oct 2026: one spelling per state, no duplicate dropdown entries, Live & Upcoming by default on /properties,
 * no "active" on the home city cards, the disclaimer line removed from the property page. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonState, stateVariants } from "../src/lib/domain/states";
import { publishedWhere } from "../src/lib/queries/publishedWhere";

const read = (p: string) => readFileSync(p, "utf8");

test("one spelling per state: '&' and 'and', old names and case all give the same state", () => {
  assert.equal(canonState("Andaman & Nicobar Islands"), "Andaman And Nicobar Islands");
  assert.equal(canonState("Andaman And Nicobar Islands"), "Andaman And Nicobar Islands");
  assert.equal(canonState("andaman&nicobar islands"), "Andaman And Nicobar Islands");
  assert.equal(canonState("Jammu & Kashmir"), canonState("Jammu And Kashmir"));
  assert.equal(canonState("Orissa"), "Odisha");
  assert.equal(canonState("  maharashtra "), "Maharashtra");
  assert.equal(new Set(["Andaman & Nicobar Islands", "Andaman And Nicobar Islands", "ANDAMAN AND NICOBAR ISLANDS"].map(canonState)).size, 1);
});

test("the State filter finds listings stored under either spelling (and the old state name)", () => {
  const v = stateVariants("Andaman And Nicobar Islands");
  assert.ok(v.includes("Andaman And Nicobar Islands") && v.includes("Andaman & Nicobar Islands"));
  assert.ok(stateVariants("Odisha").some((x) => x.toLowerCase() === "orissa"));
  const where = JSON.stringify(publishedWhere({ state: "Andaman And Nicobar Islands" }));
  assert.ok(where.includes("Andaman & Nicobar Islands") && where.includes("Andaman And Nicobar Islands"));
  assert.ok(JSON.stringify(publishedWhere({ state: "Maharashtra" })).includes("Maharashtra"));
});

test("places list uses the shared canonical state, so the dropdown cannot list one state twice", () => {
  const places = read("src/lib/queries/places.ts");
  assert.match(places, /import \{ canonState \} from "@\/lib\/domain\/states"/);
  assert.ok(!/const STATE_ALIASES/.test(places));
});

test("Auction status dropdown has no extra empty entry (no duplicate 'Live & Upcoming')", () => {
  const dd = read("src/components/Dropdown.tsx");
  assert.match(dd, /noEmpty\?: boolean/);
  assert.match(dd, /\{!noEmpty && \(/);
  const form = read("src/components/PropertyFilterForm.tsx");
  const status = form.slice(form.indexOf("Auction status"), form.indexOf("Min ₹"));
  assert.match(status, /\bnoEmpty\b/);
  assert.equal((status.match(/label: "Live & Upcoming"/g) ?? []).length, 1);
});

test("/properties defaults to Live & Upcoming; 'all' and 'completed' only when asked", () => {
  const page = read("src/app/(site)/properties/page.tsx");
  assert.match(page, /status === "completed" \|\| status === "all" \? status : "active"/);
  assert.ok(!/status === "completed" \|\| status === "active" \? status : "all"/.test(page));
});

test("home: the featured carousel only takes Live / Upcoming auctions; city cards show only the property count", () => {
  assert.match(read("src/lib/queries/homeData.ts"), /where: \{ status: "PUBLISHED", auctions: \{ some: \{ AND: \[activeAuctionWhere\(\)\] \} \} \}/);
  const home = read("src/app/(site)/page.tsx");
  assert.ok(!/ active<\/div>/.test(home) && !/\{active\.toLocaleString/.test(home));
  assert.match(home, /propert\{total === 1 \? "y" : "ies"\}<\/div>/);
});

test("the 'Details are collected from the bank / auction portal notices' line is gone from the property page", () => {
  const p = read("src/app/(site)/property/[slug]/page.tsx");
  assert.ok(!/Details are collected from the bank/.test(p));
  assert.ok(!/This is not legal or financial advice/.test(p));
});
