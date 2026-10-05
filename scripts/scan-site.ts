import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "@/lib/db/prisma";
import { validateFeedUrl } from "@/data-sources/feeds/run";
import { scanSiteForNew, webStateOf, withWebState } from "@/data-sources/feeds/siteScan";

/**
 * Scan a whole website for property listings and import each one with its full details (the listing page, its notice
 * PDFs, one AI call per listing). Run it yourself:
 *
 *   npx tsx scripts/scan-site.ts https://findauction.in --dry-run          (only shows what it would read)
 *   npx tsx scripts/scan-site.ts https://findauction.in --max 50           (reads up to 50 new listings)
 *   npx tsx scripts/scan-site.ts https://findauction.in --max 200 --save-source "Find Auction"
 *
 * Options:  --max N        new listings to read in full (default 25)
 *           --pages N      index pages to look through (default 30)
 *           --minutes N    time limit (default 30)
 *           --dry-run      discover only: nothing is read by the AI, nothing is written
 *           --save-source "Name"   also keep this site as a source: it is then scanned again every hour automatically
 *
 * Only pages robots.txt allows, same site only, no login, never the do-not-fetch list. Listings already on the site
 * are skipped, so running it again only picks up what is new.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const raw = process.argv.slice(2).find((a) => !a.startsWith("--") && /^https?:\/\//i.test(a));
  if (!raw) {
    console.error('Usage: npx tsx scripts/scan-site.ts <https://website> [--max 25] [--pages 30] [--minutes 30] [--dry-run] [--save-source "Name"]');
    process.exit(1);
  }
  const check = validateFeedUrl(raw.replace(/^http:/i, "https:"));
  if (!check.ok) {
    console.error(`Not allowed: ${check.reason}`);
    process.exit(1);
  }
  const start = check.url;
  const dryRun = flag("dry-run");
  const saveName = arg("save-source");
  const maxNew = Number(arg("max") ?? 25);
  const minutes = Number(arg("minutes") ?? 30);

  const existing = await prisma.feedSource.findFirst({ where: { OR: [{ url: start }, ...(saveName ? [{ name: saveName }] : [])] } });
  const feedName = existing?.name ?? saveName ?? new URL(start).hostname.replace(/^www\./, "");
  const state = webStateOf(existing?.sheetState);
  console.log(`Source: ${feedName}${existing ? " (already saved)" : ""} | already read before: ${state.seen.length} page(s) | ${dryRun ? "DRY RUN" : `reading up to ${maxNew} new listing(s)`}`);

  const res = await scanSiteForNew({ startUrl: start, feedName, seen: state.seen, maxNew, maxIndexPages: Number(arg("pages") ?? 30), deadline: Date.now() + minutes * 60_000, dryRun, onProgress: (l) => console.log(l) });

  console.log("\n— Summary —");
  console.log(`listing pages found: ${res.discovered} | new: ${res.unseen} | read in full: ${res.read}`);
  if (!dryRun) {
    console.log(`imported: ${res.import.created} new, ${res.import.skipped} already on the site, ${res.import.failed} rejected (no price/date/place) | AI tokens: ${res.tokens} | notice PDFs read: ${res.pdfs}`);
    if (res.pending) console.log(`More new listings are waiting: run the same command again (or add --max ${maxNew * 4}).`);
  }
  for (const n of res.notes) console.log(`note: ${n}`);

  if (!dryRun) {
    const sheetState = withWebState(existing?.sheetState, { seen: res.seen, lastAt: new Date().toISOString() });
    if (existing) await prisma.feedSource.update({ where: { id: existing.id }, data: { sheetState } });
    else if (saveName) {
      await prisma.feedSource.create({ data: { name: saveName, url: start, sheetState, lastRunAt: new Date(), lastStatus: "ok", lastMessage: `Site scan: ${res.import.created} new listing(s) read in full. ${res.pending ? "Continues automatically." : ""}`.trim() } });
      console.log(`Saved as a source: "${saveName}" — it will now be scanned again every hour automatically.`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
