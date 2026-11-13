/*
 * eAuctionsIndia MAHARASHTRA: pages -> BankAuction, one resumable command. Maharashtra only; BAANKNET and other sources are not touched.
 *
 *   npm run eauctions:maharashtra:preview      dry run: reads the pages in hand, shows the plan + a read-only duplicate check, writes nothing
 *   npm run eauctions:maharashtra:import       --live --confirm-import: tries the live crawl (permission-gated, stops on any refusal), then imports every page in hand
 *
 * Pages in hand (read automatically):
 *   - hand-saved pages in --pages-dir (default: the project folder): eauctions-maharashtra*.html (list pages), eauctions-property-*.html (detail pages)
 *   - staging files written by the live crawler: --staging (default staging/eauctions-maharashtra.jsonl, with .details.jsonl)
 * A detail page enriches its listing (its values win; only fields it leaves empty are filled from the list card). Nothing is invented.
 *
 * Options: --live  --from=1 --to=N --max-pages=N --details --detail-limit=N --delay-ms=1500 (live crawl)   --batch-size=100  --max-batches=N
 *          --dry-run  --check-duplicates  --confirm-import  --restart (ignore the saved "already imported" list; the importer still never duplicates)
 *          --report=<file.json>  --pages-dir=<folder>  --staging=<file>
 * Import needs EAUCTIONS_AUTHORIZED=yes, EAUCTIONS_AUTH_NOTE=<where the written permission is> and the scope flag of the pages used:
 *   EAUCTIONS_SCOPE_LOCAL_FILE=yes (hand-saved pages)  /  EAUCTIONS_SCOPE_AUTOMATED=yes (crawled pages). Resume = run the same command again.
 * "Imported" is only what a read-only database count confirms; the site's own headline totals are printed as source-reported numbers.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildMapping, evidenceFromHtml, parseDirectory } from "../src/data-sources/eauctionsindia/institutions";
import { qualify } from "../src/data-sources/eauctionsindia/qualify";
import { bulkWriteAllowed, collectFromHtml, doneSig, runBulk, type BulkReport, type Collected, type SourceFile } from "../src/data-sources/eauctionsindia/bulkPipeline";
import { crawlMaharashtra, type DetailLog, type PageLog, type StagedListing } from "../src/data-sources/eauctionsindia/sliceCrawl";
import { fileStore, readJsonl } from "../src/data-sources/eauctionsindia/stagingStore";
import { ID_PREFIX } from "../src/data-sources/eauctionsindia/localFile";
import { acquireLock } from "../src/data-sources/eauctionsindia/runLock";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => process.argv.includes(`--${n}`);
const num = (n: string) => { const v = arg(n); return v === undefined ? undefined : Number(v); };

(async () => {
  const confirm = has("confirm-import");
  const dir = arg("pages-dir") ?? ".";
  const staging = arg("staging") ?? "staging/eauctions-maharashtra.jsonl";
  const donePath = "import-state/eauctions-maharashtra-done.json";
  // one import at a time (a dry run only reads and does not need the lock)
  if (!has("dry-run")) {
    const lock = acquireLock("import-state/eauctions-bulk.lock");
    if (!lock.ok) { console.log(`Another eAuctions import is running (started ${lock.holder.at}, pid ${lock.holder.pid}). Not started. If it crashed, the lock expires after 2 hours.`); process.exitCode = 1; return; }
    process.on("exit", () => lock.release());
  }
  let stop = false;
  process.on("SIGINT", () => { stop = true; console.log("\nStopping after the current step..."); });

  // 1. optional live crawl into the staging files (permission-gated; any refusal stops it; the import below then uses what is already in hand)
  let crawlerPages: BulkReport["pagesFromCrawler"] = null;
  if (has("live")) {
    const r = await crawlMaharashtra({
      env: process.env, store: fileStore(staging), from: num("from"), to: num("to"), maxPagesThisRun: num("max-pages"), batchSize: num("batch-size"), delayMs: num("delay-ms"),
      details: has("details"), detailLimit: num("detail-limit") ?? 0, dryRun: has("dry-run"), stopped: () => stop, log: (l) => console.log(`[crawl] ${l}`),
    });
    console.log(`LIVE CRAWL: ${r.state}. ${r.message}`);
    console.log(`  pages fetched ${r.totals.pagesFetched}, blocked ${r.totals.blockedPages}, failed ${r.totals.failedPages}, layout/empty ${r.totals.layoutChanged}, new listings staged ${r.totals.newListings}`);
    if (["no_permission", "robots_blocked", "blocked_site_wide"].includes(r.state)) console.log("  Live collection needs the operator to allow-list our crawler (BankAuctionBot/1.0) or give a bulk export/API. Continuing with the pages already in hand.");
  }
  const pg = readJsonl<PageLog>(`${staging}.pages.jsonl`).rows;
  if (pg.length) crawlerPages = { fetched: pg.filter((p) => p.status === "fetched").length, blocked: pg.filter((p) => p.status === "blocked").length, failed: pg.filter((p) => p.status === "failed").length, layoutChanged: pg.filter((p) => p.status === "layout_changed" || p.status === "empty").length };

  // 2. pages in hand
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => /^eauctions-(maharashtra.*|property-.*)\.html?$/i.test(f)).sort() : [];
  const files: SourceFile[] = names.map((n) => ({ name: n, html: readFileSync(join(dir, n), "utf8") }));
  const stagedL = readJsonl<StagedListing>(staging);
  const stagedD = readJsonl<DetailLog>(`${staging}.details.jsonl`);
  const collectedAll = collectFromHtml(files, {
    listRecords: stagedL.rows.map((r) => r.record).filter(Boolean),
    detailRecords: stagedD.rows.filter((d) => d.status === "fetched" && d.record).map((d) => d.record as Record<string, string>),
  });
  // 2b. the two gates: a verified institution (105-entry reconciliation) and a positively verified Maharashtra location
  const evidence = files.flatMap((f) => evidenceFromHtml(f.html, f.name));
  const directoryFiles = (arg("directory") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const f of directoryFiles) evidence.push(...parseDirectory(readFileSync(f, "utf8"), f));
  const mapping = buildMapping(evidence, { directoryComplete: has("directory-complete"), directoryFiles });
  const skipInstitution = has("skip-institution-filter");
  const q = qualify(collectedAll, mapping, { checkInstitution: !skipInstitution });
  const collected: Collected = { ...collectedAll, records: q.records, hasDetail: q.hasDetail };
  const reviewPath = join("import-reports", `eauctions-excluded-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  if (q.excluded.length) { mkdirSync(dirname(reviewPath), { recursive: true }); writeFileSync(reviewPath, q.excluded.map((x) => JSON.stringify(x)).join("\n") + "\n"); }
  const usesSaved = files.length > 0;
  const usesCrawled = stagedL.rows.length > 0 || stagedD.rows.length > 0;

  console.log(`\nPAGES IN HAND: ${files.length} saved file(s) (${collected.files.filter((f) => f.kind === "list").length} list, ${collected.files.filter((f) => f.kind === "detail").length} detail), ${stagedL.rows.length} crawled listing(s), ${stagedD.rows.length} crawled detail line(s)`);
  for (const f of collected.files) if (f.kind !== "list" && f.kind !== "detail") console.log(`  PROBLEM ${f.name}: ${f.kind} — ${f.errors.join("; ")}`);
  if (stagedL.broken + stagedD.broken) console.log(`  ${stagedL.broken + stagedD.broken} broken line(s) in the staging files were skipped`);
  console.log(`QUALIFICATION: parsed ${q.counts.parsed}  |  institution verified ${skipInstitution ? "(filter skipped)" : q.counts.institutionMatched}  |  Maharashtra positively verified ${q.counts.maharashtraVerified}  |  QUALIFIED ${q.counts.qualified}  |  excluded for institution ${q.counts.institutionExcluded}, location rejected ${q.counts.locationRejected}, review required ${q.counts.reviewRequired}`);
  if (skipInstitution) console.log("  WARNING: --skip-institution-filter was given: the verified-institution rule is OFF for this run.");
  if (q.excluded.length) console.log(`  ${q.excluded.length} listing(s) not imported; reasons logged in ${reviewPath}`);
  if (!collected.records.size) { console.log("No listing qualifies (verified institution + verified Maharashtra location). Nothing to do."); process.exitCode = 1; return; }

  // 3. gate
  let mode: "dry" | "import" = "dry";
  if (confirm && !has("dry-run")) {
    for (const [used, origin] of [[usesSaved, "saved_pages"], [usesCrawled, "crawled"]] as const) {
      if (!used) continue;
      const g = bulkWriteAllowed(process.env, true, origin);
      if (!g.ok) { console.log(`IMPORT REFUSED: ${g.reason}`); process.exitCode = 1; return; }
    }
    mode = "import";
  }

  // 4. database (read-only lookups; writes only in import mode)
  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (mode === "import" || has("check-duplicates")) prisma = (await import("../src/lib/db/prisma")).prisma;
  const db = prisma;
  const rawKeys = db ? async (keys: string[]) => (await db.auction.findMany({ where: { externalAuctionId: { in: keys } }, select: { externalAuctionId: true } })).map((a) => a.externalAuctionId as string) : undefined;
  // The database can be overloaded (connection pool timeout). A read-only lookup is retried a few times; in a dry run, if it still fails, the offline preview is shown anyway.
  const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let existingKeys: typeof rawKeys = rawKeys && (async (keys) => {
    for (let a = 0; ; a++) { try { return await rawKeys(keys); } catch (e) { if (a >= 2) throw e; console.log(`[db] lookup failed (${String(e instanceof Error ? e.message : e).split("\n").pop()?.slice(0, 120)}); retrying in 10 s`); await sleepMs(10_000); } }
  });
  let dbNote = "";
  if (mode === "dry" && existingKeys) {
    try { await existingKeys([...collected.records.keys()].slice(0, 1)); }
    catch { existingKeys = undefined; dbNote = "database unreachable or overloaded (connection pool timeout): duplicate check skipped; this preview is offline only."; console.log(`[db] ${dbNote}`); }
  }
  let importBatch: Parameters<typeof runBulk>[0]["importBatch"];
  if (mode === "import" && db) {
    const { importRecords } = await import("../src/lib/import/csvImport");
    const feed = await db.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { name: true, url: true } });
    if (!feed) { console.log("No eAuctionsIndia feed source exists in this database."); process.exitCode = 1; await db.$disconnect(); return; }
    importBatch = async (recs) => {
      const x = await importRecords(recs, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "html" });
      return { created: x.created, updated: x.updated ?? 0, skipped: Math.max(0, x.skipped - (x.updated ?? 0)), failed: x.failed };
    };
  }
  const done = new Set<string>(!has("restart") && existsSync(donePath) ? (JSON.parse(readFileSync(donePath, "utf8")) as string[]) : []);

  const out = await runBulk({
    collected, mode, batchSize: num("batch-size"), maxBatches: num("max-batches"), done, importBatch, existingKeys,
    saveDone: async (d) => { mkdirSync(dirname(donePath), { recursive: true }); writeFileSync(donePath, JSON.stringify([...d])); },
    log: (l) => console.log(`[import] ${l}`),
  });
  const r = out.reconciliation;

  // 5. read-only verification
  let verified: number | null = null;
  let totalStored: number | null = null;
  if (db && existingKeys) {
    try {
      const keys = [...collected.records.keys()];
      verified = 0;
      for (let i = 0; i < keys.length; i += 500) verified += (await existingKeys(keys.slice(i, i + 500))).length;
      totalStored = await db.auction.count({ where: { externalAuctionId: { startsWith: ID_PREFIX } } });
    } catch { verified = null; totalStored = null; dbNote = "the database count could not be read (overloaded): NOT verified. Do not treat this run as confirmed."; }
  }

  console.log(`\nSUMMARY (${mode === "import" ? "IMPORT" : "DRY RUN — nothing written"})`);
  console.log(`  cards parsed: ${collected.cardsParsed}   unique listings: ${collected.records.size}   rejected cards: ${collected.rejectedCards}   duplicates across pages/files: ${collected.duplicatesAcrossFiles}`);
  if (crawlerPages) console.log(`  crawler pages: ${crawlerPages.fetched} fetched, ${crawlerPages.blocked} blocked, ${crawlerPages.failed} failed, ${crawlerPages.layoutChanged} layout-changed/empty`);
  if (mode === "dry") console.log(`  database (read-only): ${r.wouldMatchExisting === null ? "not checked (add --check-duplicates)" : `${r.wouldMatchExisting} already stored, ${r.wouldBeNew} new`}`);
  else console.log(`  already imported earlier (resume): ${out.alreadyDone}   sent this run: ${r.thisRun.sent} in ${r.thisRun.batches} batch(es): ${r.thisRun.created} new, ${r.thisRun.updated} updated, ${r.thisRun.skipped} skipped (already stored), ${r.thisRun.failed} failed`);
  const e = out.enrichment;
  console.log(`  detail enrichment: ${e.withDetail} of ${e.listings} listings have a detail page (${e.coveragePct}%); ${e.withoutDetail} have list-card data only`);
  if (e.withDetail) console.log(`  detail pages missing: ${Object.entries(e.missing).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing"}`);
  console.log(`  site-reported headline total(s): ${collected.headlineTotals.length ? [...new Set(collected.headlineTotals)].join(", ") : "n/a"}  (source-reported numbers, NOT imported records)`);
  if (dbNote) console.log(`  DATABASE: ${dbNote}`);
  if (verified !== null) console.log(`  VERIFIED IN THE DATABASE (read-only): ${verified} of ${collected.records.size} listings in hand are stored; ${totalStored} eAuctionsIndia auctions stored in total.`);
  console.log(`  state: ${r.state}. ${r.message}`);

  const report: BulkReport = {
    generatedAt: new Date().toISOString(), mode, files: collected.files, pagesFromCrawler: crawlerPages, cardsParsed: collected.cardsParsed, uniqueListings: collected.records.size,
    rejectedCards: collected.rejectedCards, duplicatesAcrossFiles: collected.duplicatesAcrossFiles, enrichment: e, sourceReportedHeadlineTotals: collected.headlineTotals,
    reconciliation: r, databaseVerifiedStored: verified, qualification: { ...q.counts, institutionFilter: !skipInstitution, excluded: q.excluded },
    note: "Headline totals are the website's own claims. Only databaseVerifiedStored counts as stored. This covers only the pages that were in hand.",
  };
  const reportPath = arg("report") ?? join("import-reports", `eauctions-maharashtra-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 1));
  console.log(`  report: ${reportPath}`);
  await db?.$disconnect();
  process.exitCode = ["dry_run", "completed", "partial", "already_completed"].includes(r.state) ? 0 : 1;
  void doneSig;
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
