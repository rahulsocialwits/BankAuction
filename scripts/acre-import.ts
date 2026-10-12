/*
 * ACRE "Assets for sale" import (https://www.acreindia.in/assets-for-sale), see src/data-sources/acre/.
 *   npx tsx scripts/acre-import.ts            DRY RUN (default): reads the pages, parses, prints counts, imports NOTHING
 *   npx tsx scripts/acre-import.ts --apply    imports into the database in .env (idempotent: running it again never duplicates)
 * One request every 1.5 seconds, robots.txt checked first, stops at any refusal. Borrower names are never read.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { runAcreImport } from "../src/data-sources/acre/import";

(async () => {
  const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "acreindia.in" } }, select: { id: true, name: true, url: true } });
  if (!feed) return console.log("No ACRE feed source exists in this database (Admin -> Feeds).");
  const apply = process.argv.includes("--apply");
  const r = await runAcreImport(feed, { apply, log: (l) => console.log(l) });
  console.log(`\n${apply ? "APPLIED" : "DRY RUN"}: ${r.message}`);
  console.log(JSON.stringify({ pages: r.pages, found: r.found, created: r.created, updated: r.updated, skipped: r.skipped, rejected: r.rejected, total: r.total, complete: r.complete }));
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); });
