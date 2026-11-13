/*
 * eAuctionsIndia bulk import from an OFFICIALLY AUTHORIZED export file (CSV or JSON). Reads a FILE only: no request is made to the website.
 * Maharashtra only. Default is a DRY RUN that writes nothing.
 *
 *   1. See the file's columns:       npx tsx scripts/eauctions-export-import.ts --file=export.csv --print-headers
 *   2. Write a field map (JSON: listing key -> column name), e.g. {"id":"Auction ID","state":"State","city":"City","reservePrice":"Reserve Price", ...}
 *      keys: id, title, bank, branch, address, city, state, locality, pincode, propertyType, reservePrice, emd, auctionStart, auctionEnd,
 *            noticeNumber, url, description, auctionType, documents.   (id, state and a price or auction date are required.)
 *   3. Dry run:                      npx tsx scripts/eauctions-export-import.ts --file=export.csv --map=map.json [--source-total=N] [--check-duplicates]
 *   4. Import (only after the operator's written permission covering this export has been read):
 *        set EAUCTIONS_AUTHORIZED=yes
 *        set EAUCTIONS_AUTH_NOTE=<sender, date, subject of the written permission>
 *        set EAUCTIONS_SCOPE_EXPORT=yes
 *        npx tsx scripts/eauctions-export-import.ts --file=export.csv --map=map.json --confirm-import [--batch-size=100] [--max-batches=N]
 *   Resume after an interruption: run the same command again (checkpoint in import-state/). --restart starts over (rows in the database are never deleted).
 *   Cron (only once the source above is configured; same exit codes: 0 ok, 1 blocked / invalid / failed, 2 usage):
 *        npx tsx scripts/eauctions-export-import.ts --file=<path> --map=<path> --confirm-import --max-batches=20
 *   Logs: import-logs/eauctions-export-<time>.log (JSON lines).   --state=Maharashtra is the default and the only supported use.
 */
import "dotenv/config";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { exportKey, exportWriteAllowed, fileHash, normalizeAll, readExport, runExportImport, type ExportCheckpoint, type ExportMap, type Reconciliation } from "../src/data-sources/eauctionsindia/exportImport";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => process.argv.includes(`--${n}`);

function printReconciliation(r: Reconciliation, b: ReturnType<typeof normalizeAll>) {
  console.log("\nRECONCILIATION");
  console.log(`  source total (declared by the source/file): ${r.sourceTotal ?? "not declared (pass --source-total=N from the operator's documentation)"}`);
  console.log(`  rows read from the file: ${r.rowsRead}`);
  console.log(`  valid: ${r.valid}   invalid: ${r.invalid}   not real estate: ${r.excludedNotRealEstate}   duplicates in the file: ${r.duplicatesInFile}`);
  console.log(`  planned for import: ${r.planned}`);
  if (r.mode === "dry") console.log(`  database (read-only): ${r.wouldMatchExisting === null ? "not checked (add --check-duplicates)" : `${r.wouldMatchExisting} already stored (would update/skip), ${r.wouldBeNew} new`}`);
  else {
    console.log(`  this run: ${r.thisRun.sent} sent in ${r.thisRun.batches} batch(es): ${r.thisRun.created} new, ${r.thisRun.updated} updated, ${r.thisRun.skipped} skipped (already stored), ${r.thisRun.failed} failed`);
    console.log(`  all runs on this file: ${r.total.created} new, ${r.total.updated} updated, ${r.total.skipped} skipped, ${r.total.failed} failed; position ${r.nextIndex}/${r.planned}`);
  }
  console.log(`  file coverage verified against the declared total: ${r.fileCoverageVerified ? "YES (every row accounted for)" : "NO (no declared total, or rows do not add up)"}`);
  const w = Object.entries(b.warnings).map(([k, n]) => `${k}: ${n}`).join(", ");
  console.log(`  records kept with empty optional fields: ${w || "none"}`);
  if (b.invalid.length) {
    const by: Record<string, number> = {};
    for (const i of b.invalid) for (const e of i.errors) by[e.replace(/"[^"]*"/g, '"…"')] = (by[e.replace(/"[^"]*"/g, '"…"')] ?? 0) + 1;
    console.log("  invalid records by reason:");
    for (const [k, n] of Object.entries(by).sort((a, c) => c[1] - a[1])) console.log(`    ${n} x ${k}`);
    console.log("  first invalid rows: " + b.invalid.slice(0, 5).map((i) => `row ${i.index} (${i.errors.join("; ")})`).join(" | "));
  }
  console.log(`\n${r.state.toUpperCase()}: ${r.message}`);
}

(async () => {
  const file = arg("file");
  if (!file) { console.log("Usage: --file=<export.csv|export.json> [--print-headers | --map=map.json ...]. See the header of this script."); process.exitCode = 2; return; }
  if (!existsSync(file)) { console.log(`File not found: ${file}\nThis command needs the export file the operator gives you. "export.csv" in the examples is only a placeholder name.\nTo try the tool now, use the synthetic test file: --file=tests/fixtures/eauctions-export-sample.csv`); process.exitCode = 2; return; }
  const text = readFileSync(file, "utf8");
  const read = readExport(text, file);
  if ("error" in read) { console.log(`Cannot read the file: ${read.error}`); process.exitCode = 2; return; }

  if (has("print-headers")) {
    const cols = new Set<string>();
    for (const r of read.rows.slice(0, 50)) for (const k of Object.keys(r)) cols.add(k);
    console.log(`${file}: ${read.format.toUpperCase()}, ${read.rows.length} row(s)${read.declaredTotal !== null ? `, declared total ${read.declaredTotal}` : ""}`);
    console.log(`Columns: ${[...cols].join(" | ")}`);
    console.log("First row:", JSON.stringify(read.rows[0] ?? {}).slice(0, 600));
    return;
  }

  const mapPath = arg("map") ?? process.env.EAUCTIONS_EXPORT_MAP;
  if (!mapPath || !existsSync(mapPath)) { console.log("A field map is required: --map=map.json (listing key -> column name). Use --print-headers to see the columns."); process.exitCode = 2; return; }
  let map: ExportMap;
  try { map = JSON.parse(readFileSync(mapPath, "utf8")) as ExportMap; } catch { console.log("The field map is not valid JSON."); process.exitCode = 2; return; }
  const missingKeys = (["id", "state"] as const).filter((k) => !map[k]);
  if (missingKeys.length || !(map.reservePrice || map.auctionStart)) { console.log(`The field map must map: id, state, and reservePrice or auctionStart (missing: ${[...missingKeys, ...(map.reservePrice || map.auctionStart ? [] : ["reservePrice/auctionStart"])].join(", ")}).`); process.exitCode = 2; return; }

  const declared = arg("source-total") !== undefined ? Number(arg("source-total")) : read.declaredTotal;
  const confirm = has("confirm-import");
  const gate = exportWriteAllowed(process.env, confirm);
  if (confirm && !gate.ok) { console.log(`IMPORT REFUSED: ${gate.reason}`); process.exitCode = 1; return; }

  const batch = normalizeAll(read.rows, map, arg("state") ?? "Maharashtra");
  const hash = fileHash(text, map);
  const logPath = arg("log") ?? join("import-logs", `eauctions-export-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  const logLine = (line: string) => { console.log(`[export] ${line}`); appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), msg: line }) + "\n"); };
  logLine(`file ${basename(file)} (${read.format}), ${read.rows.length} row(s), ${batch.valid.length} valid, ${batch.invalid.length} invalid, ${batch.duplicates.length} duplicate(s), mode ${confirm ? "IMPORT" : "dry"}`);

  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (confirm || has("check-duplicates")) prisma = (await import("../src/lib/db/prisma")).prisma;
  const db = prisma;
  const existingKeys = db ? async (keys: string[]) => (await db.auction.findMany({ where: { externalAuctionId: { in: keys } }, select: { externalAuctionId: true } })).map((a) => a.externalAuctionId as string) : undefined;

  const cpPath = join("import-state", `eauctions-export-${hash.slice(0, 12)}.json`);
  let importBatch: Parameters<typeof runExportImport>[0]["importBatch"];
  if (confirm && db) {
    const { importRecords } = await import("../src/lib/import/csvImport");
    const feed = await db.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { name: true, url: true } });
    if (!feed) { console.log("No eAuctionsIndia feed source exists in this database."); process.exitCode = 1; await db.$disconnect(); return; }
    importBatch = async (recs) => {
      const x = await importRecords(recs, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "api" });
      return { created: x.created, updated: x.updated ?? 0, skipped: Math.max(0, x.skipped - (x.updated ?? 0)), failed: x.failed };
    };
  }

  const rec = await runExportImport({
    batch, rowsRead: read.rows.length, declaredTotal: Number.isFinite(declared as number) ? (declared as number) : null, hash, mode: confirm ? "import" : "dry",
    batchSize: arg("batch-size") ? Number(arg("batch-size")) : 100, maxBatches: arg("max-batches") ? Number(arg("max-batches")) : undefined, restart: has("restart"),
    importBatch, existingKeys, log: logLine,
    loadCheckpoint: async () => (existsSync(cpPath) ? (JSON.parse(readFileSync(cpPath, "utf8")) as ExportCheckpoint) : null),
    saveCheckpoint: async (c) => { mkdirSync(dirname(cpPath), { recursive: true }); writeFileSync(cpPath, JSON.stringify(c, null, 1)); },
  });
  printReconciliation(rec, batch);

  if (confirm && db) { // read-only verification: how many of the planned records are really stored now
    const keys = batch.valid.map((r) => String(r.external_id));
    let stored = 0;
    for (let i = 0; i < keys.length; i += 500) stored += (await existingKeys!(keys.slice(i, i + 500))).length;
    console.log(`\nVERIFIED IN THE DATABASE (read-only count): ${stored} of ${keys.length} planned records are stored. Only this number counts as imported.`);
    logLine(`verified in database: ${stored} of ${keys.length}`);
  }
  logLine(`result ${rec.state}`);
  console.log(`Log: ${logPath}${confirm ? `\nCheckpoint: ${cpPath}` : ""}`);
  await db?.$disconnect();
  process.exitCode = ["dry_run", "completed", "partial", "already_completed"].includes(rec.state) ? 0 : 1;
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });

void exportKey;
