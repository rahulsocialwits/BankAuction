import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeObservation,
  encodeObservation,
  normalizeObservedValue,
  observationsFromListing,
  planObservations,
  recordObservations,
  sourceLabelOf,
  type ObservationStore,
  type FieldObservation,
  type StoredObservation,
} from "../src/lib/pipeline/fieldProvenance";

/*
 * Field-level provenance (Phase 3, PR 3): an append-only record of WHERE an important auction field (reserve price, auction
 * date, address) was seen, by which source and method, and when. It never overwrites history and never decides which value wins.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

/** In-memory twin of the Prisma store: append-only, newest first on read. */
class MemoryStore implements ObservationStore {
  rows: StoredObservation[] = [];
  appended = 0;
  async latest(propertyId: string) {
    return this.rows.filter((r) => r.propertyId === propertyId).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  }
  async append(propertyId: string, rows: { field: string; auctionId: string | null; newValue: string; detectedAt: Date }[]) {
    for (const r of rows) {
      const obs = decodeObservation({ field: r.field, newValue: r.newValue, auctionId: r.auctionId, detectedAt: r.detectedAt });
      assert.ok(obs, "every appended row must decode");
      this.rows.push({ ...obs, propertyId });
      this.appended++;
    }
  }
}

const listing = { reserve: 4_250_000, start: new Date("2026-11-05T10:00:00Z"), address: "Plot 12, Sector 5, Faridabad, Haryana 121002" };
const html = { source: "Example Bank", method: "html" as const, document: "https://example.test/notice/1" };
const T0 = new Date("2026-10-08T05:00:00Z");
const T1 = new Date("2026-10-09T05:00:00Z");

test("IMPORT creates the expected observations: reserve price, auction date and address, each with source, method and document", async () => {
  const store = new MemoryStore();
  const n = await recordObservations(store, { propertyId: "p1", auctionId: "a1" }, observationsFromListing(listing, html), T0);
  assert.equal(n, 3);
  const byField = Object.fromEntries(store.rows.map((r) => [r.field, r]));
  assert.equal(byField.reserve_price.value, "4250000");
  assert.equal(byField.auction_start.value, "2026-11-05T10:00:00.000Z");
  assert.equal(byField.address.value, "Plot 12, Sector 5, Faridabad, Haryana 121002");
  for (const r of store.rows) {
    assert.equal(r.source, "Example Bank");
    assert.equal(r.method, "html");
    assert.equal(r.document, "https://example.test/notice/1");
    assert.equal(r.observedAt.getTime(), T0.getTime());
  }
  assert.equal(byField.reserve_price.auctionId, "a1");
  assert.equal(byField.address.auctionId, null, "the address belongs to the property, not to one round");
});

test("an UNCHANGED value does not create a redundant observation, however often the source is re-read", async () => {
  const store = new MemoryStore();
  const target = { propertyId: "p1", auctionId: "a1" };
  await recordObservations(store, target, observationsFromListing(listing, html), T0);
  for (let i = 0; i < 20; i++) assert.equal(await recordObservations(store, target, observationsFromListing(listing, html), new Date(T1.getTime() + i * 1000)), 0);
  assert.equal(store.rows.length, 3);
  // formatting-only differences of the same address are not a change either
  const reformatted = { ...listing, address: "  plot 12,  sector 5, FARIDABAD, haryana 121002 " };
  assert.equal(await recordObservations(store, target, observationsFromListing(reformatted, html), T1), 0);
});

test("a CHANGED value creates a new observation and the earlier one is kept (history is never overwritten)", async () => {
  const store = new MemoryStore();
  const target = { propertyId: "p1", auctionId: "a1" };
  await recordObservations(store, target, observationsFromListing(listing, html), T0);
  const n = await recordObservations(store, target, observationsFromListing({ ...listing, reserve: 4_000_000 }, html), T1);
  assert.equal(n, 1);
  const reserves = store.rows.filter((r) => r.field === "reserve_price").sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  assert.deepEqual(reserves.map((r) => r.value), ["4250000", "4000000"]);
  // the value goes back to the first one: that is a new fact too (the latest from this source was 4,000,000)
  assert.equal(await recordObservations(store, target, observationsFromListing(listing, html), new Date(T1.getTime() + 1000)), 1);
  assert.equal(store.rows.filter((r) => r.field === "reserve_price").length, 3);
});

test("CONFLICTING SOURCES stay separately observable, even when one of them is not the value on the listing", async () => {
  const store = new MemoryStore();
  const target = { propertyId: "p1", auctionId: "a1" };
  await recordObservations(store, target, observationsFromListing({ reserve: 4_250_000, start: null, address: null }, { source: "Example Bank", method: "html" }), T0);
  await recordObservations(store, target, observationsFromListing({ reserve: 4_100_000, start: null, address: null }, { source: "Auction Portal", method: "pdf", document: "https://portal.test/n.pdf" }), T1);
  const reserves = store.rows.filter((r) => r.field === "reserve_price");
  assert.equal(reserves.length, 2);
  assert.deepEqual(new Set(reserves.map((r) => `${r.source}|${r.method}|${r.value}`)), new Set(["Example Bank|html|4250000", "Auction Portal|pdf|4100000"]));
  // the second source re-reading its own (unchanged) value adds nothing, and does not hide the first source's value
  assert.equal(await recordObservations(store, target, observationsFromListing({ reserve: 4_100_000, start: null, address: null }, { source: "Auction Portal", method: "pdf" }), new Date(T1.getTime() + 5000)), 0);
  assert.equal(store.rows.filter((r) => r.field === "reserve_price").length, 2);
});

test("the same value from the same source by a DIFFERENT method is recorded once as corroboration", async () => {
  const store = new MemoryStore();
  const target = { propertyId: "p1", auctionId: "a1" };
  const one = (method: "html" | "pdf") => observationsFromListing({ reserve: 4_250_000, start: null, address: null }, { source: "Example Bank", method });
  assert.equal(await recordObservations(store, target, one("html"), T0), 1);
  assert.equal(await recordObservations(store, target, one("pdf"), T1), 1);
  assert.equal(await recordObservations(store, target, one("pdf"), new Date(T1.getTime() + 1000)), 0);
});

test("each auction round keeps its own reserve price and date observations", async () => {
  const store = new MemoryStore();
  await recordObservations(store, { propertyId: "p1", auctionId: "round1" }, observationsFromListing(listing, html), T0);
  const n = await recordObservations(store, { propertyId: "p1", auctionId: "round2" }, observationsFromListing({ ...listing, reserve: 3_800_000, start: new Date("2026-12-10T10:00:00Z") }, html), T1);
  assert.equal(n, 2, "reserve price and date of the new round; the address is unchanged for the property");
});

test("source and extraction method are retained through encode / decode", () => {
  const obs: FieldObservation = { field: "reserve_price", value: "4250000", source: "Example Bank", method: "pdf", document: "https://example.test/n.pdf", confidence: 0.8, auctionId: "a1" };
  const row = encodeObservation(obs);
  assert.equal(row.field, "obs:reserve_price");
  const back = decodeObservation({ field: row.field, newValue: row.newValue, auctionId: "a1", detectedAt: T0 });
  assert.deepEqual({ ...back, observedAt: undefined }, { ...obs, observedAt: undefined });
  assert.equal(back?.observedAt.getTime(), T0.getTime());
});

test("decode ignores rows that are not observations or are malformed", () => {
  assert.equal(decodeObservation({ field: "reserve_price", newValue: "123", auctionId: null, detectedAt: T0 }), null);
  assert.equal(decodeObservation({ field: "obs:reserve_price", newValue: "not json", auctionId: null, detectedAt: T0 }), null);
  assert.equal(decodeObservation({ field: "obs:colour", newValue: JSON.stringify({ v: "x", s: "y", m: "html" }), auctionId: null, detectedAt: T0 }), null);
});

test("normalisation: missing, zero, placeholder and too-short values are never recorded", () => {
  assert.equal(normalizeObservedValue("reserve_price", 0), null);
  assert.equal(normalizeObservedValue("reserve_price", null), null);
  assert.equal(normalizeObservedValue("reserve_price", "₹42,50,000"), "4250000");
  assert.equal(normalizeObservedValue("auction_start", null), null);
  assert.equal(normalizeObservedValue("auction_start", new Date("invalid")), null);
  assert.equal(normalizeObservedValue("address", "  n/a "), null);
  assert.equal(normalizeObservedValue("address", "ab"), null);
  assert.deepEqual(observationsFromListing({ reserve: null, start: null, address: "" }, html), []);
});

test("duplicates inside one batch collapse to one row", () => {
  const plan = planObservations([...observationsFromListing(listing, html), ...observationsFromListing(listing, html)], []);
  assert.equal(plan.length, 3);
});

test("source label drops the 'feed:' prefix", () => {
  assert.equal(sourceLabelOf("feed:BAANKNET"), "BAANKNET");
  assert.equal(sourceLabelOf("date_derived"), "date_derived");
});

test("recordObservations never throws: a failing store only means no provenance is written", async () => {
  const broken: ObservationStore = {
    latest: async () => {
      throw new Error("db down");
    },
    append: async () => {
      throw new Error("db down");
    },
  };
  assert.equal(await recordObservations(broken, { propertyId: "p", auctionId: "a" }, observationsFromListing(listing, html), T0), 0);
});

/* ---- wiring / safety guards ---- */

test("the importer records observations for new listings AND for re-reads of existing ones, tagged with a method", () => {
  const src = read("src/lib/import/csvImport.ts");
  assert.match(src, /observeListing\(/);
  assert.match(src, /method\?: ExtractionMethod/);
  assert.ok((src.match(/observeListing\(/g) ?? []).length >= 2, "new listings and matched existing listings");
});

test("the BankAuctions.in crawler records observations with the html method", () => {
  const src = read("src/data-sources/bankauctions/adapter.ts");
  assert.match(src, /observeListing\(/);
  assert.match(src, /"html"/);
});

test("importers declare their extraction method", () => {
  assert.match(read("src/data-sources/feeds/baanknetImport.ts"), /method: "api"/);
  assert.match(read("src/data-sources/feeds/run.ts"), /method: "ai_page"/);
  assert.match(read("src/data-sources/feeds/siteScan.ts"), /method: "html"/);
  assert.match(read("src/lib/import/tabular.ts"), /method: "sheet"/);
});

test("provenance is append-only: it creates rows and never updates, deletes or changes a listing", () => {
  for (const file of ["src/lib/pipeline/fieldProvenance.ts", "src/lib/pipeline/fieldObservations.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /\.(update|updateMany|upsert|delete|deleteMany)\(/, file);
    assert.doesNotMatch(src, /status:\s*"REMOVED"/, file);
    assert.doesNotMatch(src, /prisma\.(property|auction)\./, file);
  }
  assert.match(read("src/lib/pipeline/fieldObservations.ts"), /propertyChange\.createMany/);
});

test("provenance needs no schema change: it is stored in PropertyChange under the obs: prefix", () => {
  assert.match(read("src/lib/pipeline/fieldProvenance.ts"), /OBS_PREFIX = "obs:"/);
});
