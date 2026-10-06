/*
 * Runs ONE resumable batch of the BAANKNET import against the database in .env (production when .env points there), exactly
 * like a scheduler tick does, and prints the cursor and counts before and after.
 *   npx tsx scripts/baanknet-run.ts [budgetSeconds]      (default 60)
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { baanknetStateOf, runBaanknetImport } from "../src/data-sources/feeds/baanknetImport";

async function counts(name: string) {
  const auctions = await prisma.auction.count({ where: { statusSource: `feed:${name}` } });
  const ids = await prisma.auction.findMany({ where: { statusSource: `feed:${name}` }, select: { externalAuctionId: true } });
  const distinct = new Set(ids.map((a) => a.externalAuctionId)).size;
  const published = await prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { statusSource: `feed:${name}` } } } });
  const held = await prisma.property.count({ where: { status: "DRAFT", auctions: { some: { statusSource: `feed:${name}` } } } });
  const withMedia = await prisma.property.count({ where: { auctions: { some: { statusSource: `feed:${name}` } }, media: { some: {} } } });
  const withDocs = await prisma.property.count({ where: { auctions: { some: { statusSource: `feed:${name}` } }, documents: { some: {} } } });
  return { auctions, distinctAuctionIds: distinct, published, held, withMedia, withDocs };
}

(async () => {
  const budget = Number(process.argv[2] ?? "60") * 1000;
  const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "baanknet.com" } } });
  if (!feed) return console.log("no baanknet.com source in the database");
  const cur = (f: typeof feed) => { const s = baanknetStateOf(f.sheetState); return s ? { status: ["upcoming", "live"][s.si], page: s.page, totalPages: s.totalPages, done: s.done, pagesDone: s.pagesDone, records: s.records } : null; };
  console.log("BEFORE cursor:", JSON.stringify(cur(feed)), JSON.stringify(await counts(feed.name)));
  const msg = await runBaanknetImport(feed, "manual", { budgetMs: budget, force: process.argv.includes("--force") });
  console.log("\nMESSAGE:", msg);
  const after = await prisma.feedSource.findUnique({ where: { id: feed.id } });
  console.log("AFTER cursor:", JSON.stringify(cur(after!)), JSON.stringify(await counts(feed.name)));
  await prisma.$disconnect();
  process.exit(0);
})();
