/*
 * eAuctionsIndia authorised-feed import (see src/data-sources/authorized/eauctionsindia.ts). Nothing is requested unless the written
 * authorisation is recorded in the environment (EAUCTIONS_AUTHORIZED=yes) and the feed is configured.
 *
 *   npx tsx scripts/eauctions-import.ts                 DRY RUN (default): reads one run of pages, maps, imports NOTHING, saves nothing
 *   npx tsx scripts/eauctions-import.ts --sample=20     imports at most 20 mapped records (a validation sample), saves the cursor
 *   npx tsx scripts/eauctions-import.ts --full          the full resumable import (run it again to continue after a stop)
 *   ... --max-pages=50                                  stop after this many pages in one run
 *   ... --restart                                       start again from the first page (database records are never deleted)
 *
 * Counts printed at the end: discovered, valid, new, updated, skipped, rejected, failed pages, and whether the pass is complete.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { runEauctionsFeed } from "../src/data-sources/authorized/eauctionsindia";

const num = (n: string) => { const v = process.argv.find((a) => a.startsWith(`--${n}=`)); return v ? Number(v.slice(n.length + 3)) : undefined; };

(async () => {
  const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "eauctionsindia" } }, select: { id: true, name: true, url: true } });
  if (!feed) return console.log("No eAuctionsIndia feed source exists in this database.");
  const sample = num("sample");
  const mode = process.argv.includes("--full") ? "full" : sample ? "sample" : "dry";
  const r = await runEauctionsFeed(feed, { mode, sampleSize: sample, maxPages: num("max-pages"), restart: process.argv.includes("--restart"), log: (l) => console.log(`[eauctions] ${l}`) });
  console.log(`\nMode: ${mode}\nState: ${r.state}\n${r.message}`);
  if (mode === "dry") console.log("Dry run: nothing was imported and nothing was saved.");
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); });
