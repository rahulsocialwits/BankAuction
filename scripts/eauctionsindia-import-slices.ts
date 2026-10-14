/*
 * eAuctionsIndia MAHARASHTRA listing pages -> a STAGING dataset (JSONL). It never writes to the database.
 * Ordinary requests only (honest user agent BankAuctionBot/1.0, one page at a time, paced). A 403 / Cloudflare challenge / CAPTCHA page is recorded as
 * BLOCKED and never retried; after 3 blocked pages in a row the run stops. No browser impersonation, no cookies, no challenge solving.
 *
 *   $env:EAUCTIONS_AUTHORIZED="yes"; $env:EAUCTIONS_AUTH_NOTE="<sender, date, subject of the written permission>"
 *   npx tsx scripts/eauctionsindia-import-slices.ts --dry-run                      reads at most 2 pages, writes nothing
 *   npx tsx scripts/eauctionsindia-import-slices.ts --from=1 --to=50               pages 1..50 into the staging file (resumable)
 *   npx tsx scripts/eauctionsindia-import-slices.ts                                all pages the site's own pagination reports (resumable)
 *   ... --out=staging/eauctions-maharashtra.jsonl   output file (default). Also written: <out>.pages.jsonl (one line per page + fetch status),
 *                                                    <out>.checkpoint.json, and <out>.details.jsonl with --details
 *   ... --batch-size=25      pages per batch (progress line + 5 s pause after each batch)      ... --max-pages=N  stop after N pages in this run
 *   ... --max-blocked=3      stop after this many blocked pages in a row                      ... --delay-ms=1500  pause between pages (minimum 1000)
 *   ... --resume (default)   continue from the checkpoint        --restart  read the range again (the staging file is only ever appended to; ids are not duplicated)
 *   ... --details --detail-limit=20   also read the detail page of up to N new listings (only while access is permitted; a refusal stops detail reading)
 *   ... --known-file=eauctions-maharashtra.html   mark records whose id is in a hand-saved list page          ... --check-database   read-only: mark ids BankAuction already has
 *
 * The staging file keeps, per record: id, title, type, location, city, area, bank, reserve price, auction date, detail URL, the missing fields, the source page
 * and fetch status. Nothing is invented. Coverage is claimed only for the page range actually read with no blocked or failed page.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { crawlMaharashtra } from "../src/data-sources/eauctionsindia/sliceCrawl";
import { fileStore } from "../src/data-sources/eauctionsindia/stagingStore";
import { parseEauctionsPage } from "../src/data-sources/eauctionsindia/parse";
import { unwrapViewSource } from "../src/data-sources/eauctionsindia/maharashtra";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => process.argv.includes(`--${n}`);
const num = (n: string) => { const v = arg(n); return v === undefined ? undefined : Number(v); };

(async () => {
  const out = arg("out") ?? "staging/eauctions-maharashtra.jsonl";
  let stop = false;
  process.on("SIGINT", () => { stop = true; console.log("\nStopping after the current page..."); });

  let knownIds: Set<string> | undefined;
  const known = arg("known-file");
  if (known) knownIds = new Set(parseEauctionsPage(unwrapViewSource(readFileSync(known, "utf8")), "").records.map((r) => String(r.external_id)));

  let prisma: typeof import("../src/lib/db/prisma").prisma | undefined;
  if (has("check-database")) prisma = (await import("../src/lib/db/prisma")).prisma;
  const db = prisma;

  const r = await crawlMaharashtra({
    env: process.env, store: fileStore(out), from: num("from"), to: num("to"), batchSize: num("batch-size"), maxPagesThisRun: num("max-pages"), maxBlocked: num("max-blocked"),
    delayMs: num("delay-ms"), dryRun: has("dry-run"), restart: has("restart"), details: has("details"), detailLimit: num("detail-limit") ?? 0, knownIds,
    existingInDb: db ? async (keys) => new Set((await db.auction.findMany({ where: { externalAuctionId: { in: keys } }, select: { externalAuctionId: true } })).map((a) => a.externalAuctionId as string)) : undefined,
    stopped: () => stop, log: (l) => console.log(`[eauctions-mh] ${l}`),
  });

  const t = r.totals;
  console.log(`\nSTATE: ${r.state}\n${r.message}`);
  console.log(`Pages fetched: ${t.pagesFetched}   blocked: ${t.blockedPages}   failed: ${t.failedPages}   not Maharashtra: ${t.notMaharashtra}`);
  console.log(`Listings parsed: ${t.parsed}   new (staged): ${t.newListings}   duplicate: ${t.duplicates}   rejected cards: ${t.rejected}   details fetched: ${t.details}`);
  console.log(`Range: ${r.from}..${r.to ?? "?"}   next page: ${r.nextPage}   range verified complete: ${r.rangeVerified ? "yes" : "NO"}`);
  console.log(has("dry-run") ? "Dry run: nothing was written." : `Staging file: ${out} (pages: ${out}.pages.jsonl, checkpoint: ${out}.checkpoint.json)`);
  console.log("This is a staging dataset, not an import and not a claim about the full inventory (the site reports its own total).");
  await db?.$disconnect();
  process.exitCode = ["range_complete", "partial", "dry_run_done", "interrupted"].includes(r.state) ? 0 : 1;
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
