/* Bulk import of an authorized eAuctionsIndia export FILE. The sample CSV is SYNTHETIC (tests/fixtures/eauctions-export-sample.csv): the operator's real export
 * format is not known, so the column names are only those of the test map. No network, no database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportDate, exportWriteAllowed, fileHash, normalizeAll, normalizeRow, readExport, runExportImport, type ExportCheckpoint, type ExportMap } from "../src/data-sources/eauctionsindia/exportImport";

const csv = readFileSync("tests/fixtures/eauctions-export-sample.csv", "utf8");
const map = JSON.parse(readFileSync("tests/fixtures/eauctions-export-sample.map.json", "utf8")) as ExportMap;
const read = readExport(csv, "x.csv");
assert.ok(!("error" in read));
const rows = (read as { rows: Record<string, unknown>[] }).rows;
const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };

test("reading: CSV with BOM and quoted amounts, JSON array and envelope with a declared total, Excel refused with a clear message", () => {
  assert.equal(rows.length, 8);
  assert.equal(readExport("﻿a,b\n1,2\n", "a.csv" ) && (readExport("﻿a,b\n1,2\n", "a.csv") as { rows: Record<string, unknown>[] }).rows[0].a, "1");
  const j = readExport(JSON.stringify({ total: 30448, records: [{ id: 1 }, { id: 2 }] }), "a.json") as { rows: unknown[]; declaredTotal: number };
  assert.equal(j.rows.length, 2);
  assert.equal(j.declaredTotal, 30448);
  assert.equal((readExport(JSON.stringify([{ id: 1 }]), "a.json") as { declaredTotal: number | null }).declaredTotal, null);
  assert.match((readExport("x", "a.xlsx") as { error: string }).error, /CSV/);
  assert.match((readExport("{bad", "a.json") as { error: string }).error, /not valid JSON/);
});

test("normalization: id, bank, auction type, type, place, price, EMD, India-time dates to UTC, source URL, documents", () => {
  const r = normalizeRow(rows[0], { ...map, documents: "Docs" }, 1);
  assert.deepEqual(r.errors, []);
  const rec = r.record!;
  assert.equal(rec.external_id, "src:eauctionsindia.com:900001");
  assert.equal(rec.source_url, "https://www.eauctionsindia.com/properties/900001");
  assert.equal(rec.bank, "Test Bank");
  assert.equal(rec.auction_type, "SARFAESI");
  assert.equal(rec.category, "RESIDENTIAL");
  assert.equal(rec.geo_state, "Maharashtra");
  assert.equal(rec.geo_city, "Pune");
  assert.equal(rec.reserve_price, "4500000");
  assert.equal(rec.emd, "450000");
  assert.equal(rec.auction_start, "2026-12-26T05:30:00.000Z"); // 26-12-2026 11:00 India time
  assert.equal(rec.auction_end, "2026-12-26T10:30:00.000Z");
  const withDocs = normalizeRow({ ...rows[0], Docs: "https://www.eauctionsindia.org/a.jpg|http://insecure.example/b.pdf" }, { ...map, documents: "Docs" }, 1).record!;
  assert.equal(JSON.parse(withDocs.documents!).length, 1); // only https links
  assert.equal(exportDate("2026-12-30T10:30:00+05:30"), "2026-12-30T05:00:00.000Z");
  assert.equal(exportDate("31-02-2026"), "");
  assert.equal(exportDate("garbage"), "");
});

test("a missing source URL is derived only from a numeric id (the site's own /properties/<id> pattern); a foreign URL is invalid", () => {
  assert.equal(normalizeRow(rows[1], map, 2).record!.source_url, "https://www.eauctionsindia.com/properties/900002");
  const foreign = normalizeRow(rows[7], map, 8);
  assert.equal(foreign.record, null);
  assert.ok(foreign.errors.some((e) => /not an https eauctionsindia\.com/.test(e)));
  assert.ok(normalizeRow({ ...rows[0], "Auction ID": "AB-1", "Notice URL": "" }, map, 1).errors.some((e) => /missing source URL/.test(e)));
});

test("validation: missing id, other state, invalid price, no price and no date, non-real-estate are reported, never imported", () => {
  const b = normalizeAll(rows, map);
  assert.equal(b.valid.length, 2);
  assert.equal(b.invalid.length, 4);
  assert.equal(b.excluded, 1); // the car
  assert.equal(b.duplicates.length, 1);
  const msgs = b.invalid.flatMap((i) => i.errors).join(" | ");
  assert.match(msgs, /missing id/);
  assert.match(msgs, /state "Delhi" is not Maharashtra/);
  assert.match(msgs, /reserve price "not stated" is not a valid amount/);
  assert.match(msgs, /neither a reserve price nor an auction date/);
  assert.equal(normalizeRow({ ...rows[0], State: "" }, map, 1).record, null); // a missing state is not assumed to be Maharashtra
  assert.equal(b.warnings["empty auction_end"], 1);
});

test("deduplication: the same source id twice in a file is kept once", () => {
  const b = normalizeAll(rows, map);
  assert.deepEqual(b.valid.map((r) => r.external_id), ["src:eauctionsindia.com:900001", "src:eauctionsindia.com:900002"]);
  assert.equal(b.duplicates[0].key, "src:eauctionsindia.com:900002");
});

test("dry run: nothing is sent to the importer, the duplicate preview is read-only, coverage needs a declared total that matches", async () => {
  let sends = 0;
  const b = normalizeAll(rows, map);
  const r = await runExportImport({ batch: b, rowsRead: 8, declaredTotal: 8, hash: "h", mode: "dry", importBatch: async () => { sends++; return { created: 1, updated: 0, skipped: 0, failed: 0 }; }, existingKeys: async (k) => k.slice(0, 1) });
  assert.equal(sends, 0);
  assert.equal(r.state, "dry_run");
  assert.equal(r.wouldMatchExisting, 1);
  assert.equal(r.wouldBeNew, 1);
  assert.equal(r.fileCoverageVerified, true);
  assert.equal((await runExportImport({ batch: b, rowsRead: 8, declaredTotal: null, hash: "h", mode: "dry" })).fileCoverageVerified, false); // no declared total: never claimed
  assert.equal((await runExportImport({ batch: b, rowsRead: 8, declaredTotal: 30448, hash: "h", mode: "dry" })).fileCoverageVerified, false); // the site headline is not the file
});

test("write gate: no confirm flag, authorization, note or scope means refused; all present means allowed", () => {
  assert.equal(exportWriteAllowed({ ...OK, EAUCTIONS_SCOPE_EXPORT: "yes" }, false).ok, false);
  assert.equal(exportWriteAllowed({}, true).ok, false);
  assert.equal(exportWriteAllowed(OK, true).ok, false); // no scope
  assert.equal(exportWriteAllowed({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_SCOPE_EXPORT: "yes" }, true).ok, false); // no note
  assert.equal(exportWriteAllowed({ ...OK, EAUCTIONS_SCOPE_EXPORT: "yes" }, true).ok, true);
});

function many(n: number) {
  const rs = Array.from({ length: n }, (_, i) => ({ ...rows[0], "Auction ID": String(910000 + i), "Notice URL": "" }));
  return { rs, batch: normalizeAll(rs, map) };
}
const mem = () => { let cp: ExportCheckpoint | null = null; return { load: async () => cp, save: async (c: ExportCheckpoint) => { cp = JSON.parse(JSON.stringify(c)); }, get: () => cp }; };

test("batches, checkpoint after every batch, interruption and resume without duplicates", async () => {
  const { batch } = many(25);
  const store = mem();
  const seen: string[] = [];
  const imp = async (r: Array<Record<string, string | undefined>>) => { seen.push(...r.map((x) => String(x.external_id))); return { created: r.length, updated: 0, skipped: 0, failed: 0 }; };
  const first = await runExportImport({ batch, rowsRead: 25, declaredTotal: 25, hash: "h", mode: "import", batchSize: 10, maxBatches: 1, importBatch: imp, loadCheckpoint: store.load, saveCheckpoint: store.save });
  assert.equal(first.state, "partial");
  assert.equal(first.nextIndex, 10);
  assert.equal(store.get()!.nextIndex, 10);
  const second = await runExportImport({ batch, rowsRead: 25, declaredTotal: 25, hash: "h", mode: "import", batchSize: 10, importBatch: imp, loadCheckpoint: store.load, saveCheckpoint: store.save });
  assert.equal(second.state, "completed");
  assert.equal(second.total.created, 25);
  assert.equal(seen.length, 25);
  assert.equal(new Set(seen).size, 25); // nothing sent twice
  const again = await runExportImport({ batch, rowsRead: 25, declaredTotal: 25, hash: "h", mode: "import", importBatch: imp, loadCheckpoint: store.load, saveCheckpoint: store.save });
  assert.equal(again.state, "already_completed");
  assert.equal(seen.length, 25);
});

test("retry with back-off, then a failed batch stops the run and keeps the checkpoint where it was", async () => {
  const { batch } = many(5);
  const store = mem();
  let calls = 0;
  const waits: number[] = [];
  const ok = await runExportImport({ batch, rowsRead: 5, declaredTotal: 5, hash: "h", mode: "import", importBatch: async (r) => { if (++calls < 3) throw new Error("connection reset"); return { created: r.length, updated: 0, skipped: 0, failed: 0 }; }, sleep: async (ms) => { waits.push(ms); }, loadCheckpoint: store.load, saveCheckpoint: store.save });
  assert.equal(ok.state, "completed");
  assert.deepEqual(waits, [1000, 3000]);
  const s2 = mem();
  const bad = await runExportImport({ batch, rowsRead: 5, declaredTotal: 5, hash: "h", mode: "import", importBatch: async () => { throw new Error("database down"); }, sleep: async () => undefined, loadCheckpoint: s2.load, saveCheckpoint: s2.save });
  assert.equal(bad.state, "failed_batch");
  assert.equal(s2.get()!.nextIndex, 0);
  assert.match(s2.get()!.lastError!, /database down/);
});

test("a checkpoint from a different file or field map is not resumed", async () => {
  const { batch } = many(3);
  const store = mem();
  await store.save({ fileHash: "OLD", nextIndex: 2, batches: 1, created: 2, updated: 0, skipped: 0, failed: 0, startedAt: "x", updatedAt: "x", done: false });
  let sends = 0;
  const r = await runExportImport({ batch, rowsRead: 3, declaredTotal: 3, hash: "NEW", mode: "import", importBatch: async () => { sends++; return { created: 1, updated: 0, skipped: 0, failed: 0 }; }, loadCheckpoint: store.load, saveCheckpoint: store.save });
  assert.equal(r.state, "file_changed");
  assert.equal(sends, 0);
  assert.notEqual(fileHash("a", map), fileHash("a", { ...map, id: "Other" }));
});

test("reconciliation counts add up: fetched = valid + invalid + not real estate + duplicates", () => {
  const b = normalizeAll(rows, map);
  assert.equal(b.valid.length + b.invalid.length + b.excluded + b.duplicates.length, rows.length);
});
