/*
 * eAuctionsIndia, MAHARASHTRA ONLY. There is no --full mode.
 *
 * Local saved page (no request to the site):
 *   npx tsx scripts/eauctions-maharashtra-import.ts --file="eauctions-maharashtra.html"                    PREVIEW: no database, nothing written
 *   npx tsx scripts/eauctions-maharashtra-import.ts --file=... --check-duplicates                          also a READ-ONLY database lookup (duplicates, stored count)
 *   npx tsx scripts/eauctions-maharashtra-import.ts --file=... --import [--limit=12]                       write (default 12, hard cap 50). REFUSED unless
 *        EAUCTIONS_AUTHORIZED=yes, EAUCTIONS_AUTH_NOTE and EAUCTIONS_SCOPE_LOCAL_FILE=yes are all set (the last one only after the operator's written
 *        wording has been read and covers pages saved by hand).
 *
 * Saved property DETAIL pages (/properties/<id>), one or more, comma separated; same preview / duplicate / import rules and the same write gate:
 *   npx tsx scripts/eauctions-maharashtra-import.ts --detail-file=eauctions-property-894455.html [--check-duplicates] [--import --limit=12]
 *
 * DEMO report (read-only HTML from the saved pages; add --check-database for a read-only stored count):
 *   npx tsx scripts/eauctions-maharashtra-import.ts --demo=eauctions-maharashtra.html --detail-file=eauctions-property-894455.html
 *
 * Reconciliation (read-only): saved LIST page(s) against saved DETAIL pages, by src:eauctionsindia.com:<id>:
 *   npx tsx scripts/eauctions-maharashtra-import.ts --reconcile=eauctions-maharashtra.html --detail-file=eauctions-property-894455.html [--detail-dir=<folder of eauctions-property-*.html>]
 *
 * Live site (needs the operator's approved access; nothing is bypassed):
 *   npx tsx scripts/eauctions-maharashtra-import.ts --dry --url="<Maharashtra listing address>"           reads at most 2 pages, writes nothing
 *   npx tsx scripts/eauctions-maharashtra-import.ts --sample=20 --url="..."                               writes at most 20; also needs EAUCTIONS_SCOPE_AUTOMATED=yes
 * --url (or EAUCTIONS_MAHARASHTRA_URL) is required: the address is not guessed. Live runs also need EAUCTIONS_AUTHORIZED=yes and EAUCTIONS_AUTH_NOTE
 * (optional EAUCTIONS_ALLOW_HEADER_NAME/_VALUE). A refusal (robots.txt, 401/403, CAPTCHA / Cloudflare challenge) stops the run. Ctrl+C stops after the page.
 */
import "dotenv/config";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildDemo } from "../src/data-sources/eauctionsindia/demoReport";
import { reconcile } from "../src/data-sources/eauctionsindia/reconcile";
import { planDetailFiles } from "../src/data-sources/eauctionsindia/detailFile";
import { ID_PREFIX, LOCAL_DEFAULT_LIMIT, LOCAL_HARD_CAP, planLocalImport, writeLocalImport } from "../src/data-sources/eauctionsindia/localFile";
import { inspectLocalPage } from "../src/data-sources/eauctionsindia/maharashtra";
import { runMaharashtra } from "../src/data-sources/eauctionsindia/maharashtraRun";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

async function localFile(file: string): Promise<number> {
  if (process.argv.some((a) => a.startsWith("--sample") || a === "--full" || a === "--dry")) { console.log("--file cannot be combined with --sample, --dry or --full."); return 2; }
  const html = readFileSync(file, "utf8");
  const wantImport = process.argv.includes("--import");
  const limitArg = arg("limit");
  const r = inspectLocalPage(html, 5);
  console.log(`LOCAL FILE (no request to the site): ${file}`);
  console.log(`Heading: ${r.headline || "(none)"}`);
  console.log(`Names Maharashtra: ${r.saysMaharashtra ? "yes" : "NO"}`);
  console.log(`Listing cards parsed: ${r.cards} (rejected: ${r.rejected})`);
  console.log(`Site headline total: ${r.headlineTotal ?? "?"}, last page: ${r.lastPage ?? "?"}, next: ${r.nextUrl ?? "none"}`);
  console.log(`First ${r.samples.length} parsed records:`);
  for (const s of r.samples) console.log(" ", JSON.stringify(s));

  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (wantImport || process.argv.includes("--check-duplicates")) prisma = (await import("../src/lib/db/prisma")).prisma;
  const db = prisma;
  const plan = await planLocalImport(html, {
    limit: limitArg ? Number(limitArg) : undefined,
    existingIds: db ? async (ids) => (await db.auction.findMany({ where: { externalAuctionId: { in: ids } }, select: { externalAuctionId: true } })).map((a) => a.externalAuctionId as string) : undefined,
  });
  console.log(`\nPLAN: ${plan.toSend.length} record(s) selected (limit ${plan.limit}; default ${LOCAL_DEFAULT_LIMIT}, hard cap ${LOCAL_HARD_CAP}); duplicates inside the file: ${plan.duplicatesInFile}.`);
  if (plan.alreadyInDatabase) console.log(`Duplicate check (read-only): ${plan.alreadyInDatabase.length} already in the database, ${plan.newToDatabase} new.`);
  else console.log("Duplicate check: not run (add --check-duplicates for a read-only database lookup).");
  if (db) {
    const n = await db.auction.count({ where: { externalAuctionId: { startsWith: ID_PREFIX } } });
    console.log(`Database today: ${n} eAuctionsIndia auction(s) stored (site headline ${r.headlineTotal ?? "?"}). A count of stored rows, not a coverage claim.`);
  }

  let code = plan.ok ? 0 : 1;
  if (wantImport && db) {
    const { importRecords } = await import("../src/lib/import/csvImport");
    const feed = await db.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { name: true, url: true } });
    const w = !feed
      ? { written: false, message: "No eAuctionsIndia feed source exists in this database." }
      : await writeLocalImport(plan, process.env, true, async (recs) => {
          const x = await importRecords(recs, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "html" });
          return { created: x.created, updated: x.updated ?? 0, skipped: Math.max(0, x.skipped - (x.updated ?? 0)), failed: x.failed };
        });
    console.log(`\nIMPORT: ${w.written ? "WRITTEN" : "NOT WRITTEN"}. ${w.message}`);
    if (!w.written) code = 1;
  } else console.log("\nPreview only. Nothing was written.");
  console.log("This is ONE saved page. It is not live-site coverage.");
  await db?.$disconnect();
  return code;
}

async function detailFiles(list: string): Promise<number> {
  if (process.argv.some((a) => a.startsWith("--sample") || a === "--full" || a === "--dry" || a.startsWith("--file="))) { console.log("--detail-file cannot be combined with --file, --sample, --dry or --full."); return 2; }
  const names = list.split(",").map((x) => x.trim()).filter(Boolean);
  const inputs = names.map((name) => ({ name, html: readFileSync(name, "utf8") }));
  const wantImport = process.argv.includes("--import");
  const limitArg = arg("limit");
  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (wantImport || process.argv.includes("--check-duplicates")) prisma = (await import("../src/lib/db/prisma")).prisma;
  const db = prisma;
  const plan = await planDetailFiles(inputs, {
    limit: limitArg ? Number(limitArg) : undefined,
    existingIds: db ? async (ids) => (await db.auction.findMany({ where: { externalAuctionId: { in: ids } }, select: { externalAuctionId: true } })).map((a) => a.externalAuctionId as string) : undefined,
  });
  console.log(`DETAIL FILES (no request to the site): ${names.length} file(s)`);
  for (const f of plan.files) {
    const d = f.detail;
    console.log(`\n== ${f.file}: ${d.ok ? "VALID" : "INVALID"}${f.duplicateOf ? ` (duplicate of ${f.duplicateOf}, skipped)` : ""}`);
    for (const e of d.errors) console.log(`   ERROR: ${e}`);
    if (d.id) {
      console.log(`   auction id: ${d.id}   url: ${d.canonicalUrl}`);
      console.log(`   title: ${d.sourceTitle}`);
      console.log(`   type: ${d.propertyType} (asset category: ${d.assetCategory}; auction type: ${d.auctionType})`);
      console.log(`   bank: ${d.bank}   branch: ${d.branch}   service provider: ${d.serviceProvider}`);
      console.log(`   reserve: ${d.reservePrice} (page: ${d.raw.reservePrice})   EMD: ${d.emd} (page: ${d.raw.emd})`);
      console.log(`   start: ${d.auctionStart} (page: ${d.raw.auctionStart} IST)   end: ${d.auctionEnd}   applications by: ${d.applicationDeadline}`);
      console.log(`   place: ${d.area}, ${d.city}, ${d.state}   pincode (from description text only): ${d.pincodeFromDescription || "none"}`);
      console.log(`   borrower: ${d.borrower || "(none)"}   sale notices: ${d.noticeLinks.length}   contact person/phone: ${d.contactPresent ? "present on page, NOT read" : "none"}`);
      console.log(`   description: ${d.description.slice(0, 160)}${d.description.length > 160 ? "..." : ""}`);
    }
  }
  console.log(`\nPLAN: ${plan.toSend.length} record(s) planned for import (limit ${plan.limit}; default ${LOCAL_DEFAULT_LIMIT}, hard cap ${LOCAL_HARD_CAP}). valid: ${plan.valid}, invalid: ${plan.invalid}, duplicate files: ${plan.duplicatesAmongFiles}, over the limit: ${plan.overLimit}.`);
  if (plan.alreadyInDatabase) console.log(`Duplicate check (read-only): ${plan.alreadyInDatabase.length} already in the database, ${plan.newToDatabase} new.`);
  else console.log("Duplicate check: not run (add --check-duplicates for a read-only database lookup).");
  let code = plan.ok ? 0 : 1;
  if (wantImport && db) {
    const { importRecords } = await import("../src/lib/import/csvImport");
    const feed = await db.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { name: true, url: true } });
    const w = !feed
      ? { written: false, message: "No eAuctionsIndia feed source exists in this database." }
      : await writeLocalImport(plan, process.env, true, async (recs) => {
          const x = await importRecords(recs, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "html" });
          return { created: x.created, updated: x.updated ?? 0, skipped: Math.max(0, x.skipped - (x.updated ?? 0)), failed: x.failed };
        });
    console.log(`\nIMPORT: ${w.written ? "WRITTEN" : "NOT WRITTEN"}. ${w.message}`);
    if (!w.written) code = 1;
  } else console.log("\nPreview only. Nothing was written.");
  console.log("These are hand-saved pages: not a live-site run and not Maharashtra coverage.");
  await db?.$disconnect();
  return code;
}

/** Read-only: list page(s) against saved detail pages. No network, no database, no write. */
function reconcileFiles(listArg: string, detailArg: string | undefined, dirArg: string | undefined): number {
  const listNames = listArg.split(",").map((x) => x.trim()).filter(Boolean);
  const detailNames = (detailArg ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (dirArg) for (const f of readdirSync(dirArg)) if (/^eauctions-property-.*\.html?$/i.test(f)) detailNames.push(join(dirArg, f));
  const rep = reconcile(listNames.map((name) => ({ name, html: readFileSync(name, "utf8") })), detailNames.map((name) => ({ name, html: readFileSync(name, "utf8") })));
  console.log(`RECONCILIATION (read-only; no request to the site, no database, nothing written)`);
  console.log(`List page(s): ${rep.listPages}   listing ids found: ${rep.listIds} (duplicates on the list: ${rep.duplicateListIds})   list names Maharashtra: ${rep.listSaysMaharashtra ? "yes" : "NO"}`);
  console.log(`Detail files: ${rep.detailFiles}   duplicate files (same id): ${rep.duplicateDetailFiles.length}   invalid files: ${rep.invalidFiles.length}   detail pages not on the list: ${rep.detailNotInList.length}`);
  console.log(`\nDETAIL_COMPLETE: ${rep.counts.DETAIL_COMPLETE}   DETAIL_INCOMPLETE: ${rep.counts.DETAIL_INCOMPLETE}   DETAIL_INVALID: ${rep.counts.DETAIL_INVALID}   MISSING_DETAIL: ${rep.counts.MISSING_DETAIL}   (of ${rep.listIds})\n`);
  for (const r of rep.rows) {
    const extra = [r.file ? `file ${r.file}` : "", r.missingFields.length ? `empty: ${r.missingFields.join(", ")}` : "", ...r.mismatches.map((m) => `MISMATCH ${m}`), ...r.errors.map((e) => `error: ${e}`)].filter(Boolean).join("; ");
    console.log(`  ${r.status.padEnd(17)} ${r.id}  ${r.listTitle}${extra ? `  [${extra}]` : ""}`);
  }
  for (const d of rep.duplicateDetailFiles) console.log(`  duplicate file ${d.file} (same as ${d.duplicateOf}, ${d.key}) skipped`);
  for (const d of rep.detailNotInList) console.log(`  detail page not on the list: ${d.key} (${d.file})`);
  for (const f of rep.invalidFiles) console.log(`  invalid file ${f.file}: ${f.errors.join(" | ")}`);
  console.log(`\nReady to import (complete detail, no mismatch): ${rep.readyKeys.length} of ${rep.listIds}. Writing is a separate step: --detail-file=... --import, behind the authorization gate.`);
  console.log("This covers only the saved pages, not Maharashtra (the site reports far more listings).");
  return rep.listIds > 0 ? 0 : 1;
}

/** Read-only demo: one self-contained HTML report from the saved pages. Optional read-only database count. */
async function demoReport(listFile: string, detailArg: string | undefined, dirArg: string | undefined): Promise<number> {
  const detailNames = (detailArg ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (dirArg) for (const f of readdirSync(dirArg)) if (/^eauctions-property-.*\.html?$/i.test(f)) detailNames.push(join(dirArg, f));
  let databaseCount: number | null = null;
  if (process.argv.includes("--check-database")) {
    const { prisma } = await import("../src/lib/db/prisma");
    databaseCount = await prisma.auction.count({ where: { externalAuctionId: { startsWith: ID_PREFIX } } });
    await prisma.$disconnect();
  }
  const demo = buildDemo(readFileSync(listFile, "utf8"), detailNames.map((name) => ({ name, html: readFileSync(name, "utf8") })), { databaseCount });
  const out = arg("out") ?? "demo-output/eauctions-maharashtra-demo.html";
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, demo.html, "utf8");
  const s = demo.summary;
  console.log("DEMO REPORT (read-only; saved-page sample data; nothing requested, nothing written to the database)");
  console.log(`Saved listing cards: ${s.savedListings}   complete details: ${s.completeDetails}   incomplete/invalid: ${s.incompleteDetails + s.invalidDetailFiles}   missing details: ${s.missingDetails}   duplicates: ${s.duplicates}`);
  console.log(`Database rows (eAuctionsIndia): ${s.databaseCount ?? "not checked (add --check-database)"}   Site headline (the website's own number, NOT collected): ${s.headlineTotal ?? "?"}`);
  console.log(`\nWritten: ${out}\nOpen it with:  start "" "${out}"`);
  return s.savedListings > 0 ? 0 : 1;
}

(async () => {
  const demoList = arg("demo");
  if (demoList) { process.exitCode = await demoReport(demoList, arg("detail-file"), arg("detail-dir")); return; }
  const reconcileList = arg("reconcile");
  if (reconcileList) { process.exitCode = reconcileFiles(reconcileList, arg("detail-file"), arg("detail-dir")); return; }
  const detail = arg("detail-file");
  if (detail) { process.exitCode = await detailFiles(detail); return; }
  const file = arg("file");
  if (file) { process.exitCode = await localFile(file); return; }

  const sampleArg = arg("sample");
  const dry = process.argv.includes("--dry") || !sampleArg;
  if (process.argv.includes("--full")) { console.log("There is no --full mode in this script. Use --dry or --sample=N."); process.exitCode = 2; return; }
  let stop = false;
  process.on("SIGINT", () => { stop = true; console.log("\nStopping after the current page..."); });

  let deps: Parameters<typeof runMaharashtra>[1] = { env: process.env, stopped: () => stop, log: (l) => console.log(`[eauctions-mh] ${l}`) };
  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (!dry) {
    prisma = (await import("../src/lib/db/prisma")).prisma;
    const { importRecords } = await import("../src/lib/import/csvImport");
    const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { name: true, url: true } });
    if (!feed) { console.log("No eAuctionsIndia feed source exists in this database."); process.exitCode = 1; await prisma.$disconnect(); return; }
    deps = { ...deps, importBatch: async (records) => {
      const r = await importRecords(records, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "html" });
      return { created: r.created, updated: r.updated ?? 0, skipped: Math.max(0, r.skipped - (r.updated ?? 0)), failed: r.failed };
    } };
  }
  const r = await runMaharashtra({ mode: dry ? "dry" : "sample", url: arg("url"), sampleRecords: sampleArg ? Number(sampleArg) : undefined }, deps);
  console.log(`\nMode: ${dry ? "dry (read-only)" : "sample"}\nState: ${r.state}\n${r.message}`);
  await prisma?.$disconnect();
  process.exitCode = ["dry_ok", "sample_ok"].includes(r.state) ? 0 : 1; // no process.exit(): on Windows it can crash while sockets are still closing
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
