import { prisma } from "@/lib/db/prisma";
import { enrichExisting } from "@/lib/import/csvImport";
import { normalizeListing } from "@/lib/import/normalize";
import { makeDeepener } from "@/data-sources/feeds/deepScan";
import { isAiFeed } from "@/data-sources/feeds/run";
import { normalizeUrl } from "@/data-sources/feeds/siteScan";
import { removeListingFromSource } from "./sourceRemoval";

/** Published listings of website sources that still have no reserve price (visitors would see "Not Available"). */
async function thinWhere() {
  const web = (await prisma.feedSource.findMany({ select: { name: true, url: true } })).filter((f) => isAiFeed(f.url));
  return {
    web,
    where: { reservePrice: null, statusSource: { in: web.map((f) => `feed:${f.name}`) }, property: { status: "PUBLISHED" as const } },
  };
}

export async function countThin(): Promise<number> {
  const { where } = await thinWhere();
  return prisma.auction.count({ where });
}

/**
 * Fixes thin website listings by themselves: each one's own page (and notice PDFs) is read once more; a reserve price that
 * comes out fills the listing. A listing that still has no price afterwards is hidden (Removed, with a note), never deleted.
 */
export async function fixThinListings(opts: { max?: number; budgetMs?: number } = {}): Promise<{ fixed: number; hidden: number; heldBack: number; left: number; tokens: number }> {
  const { web, where } = await thinWhere();
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const listPages = new Set(web.map((f) => normalizeUrl(f.url, f.url)).filter(Boolean) as string[]);
  const rows = await prisma.auction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.max ?? 60,
    select: { id: true, propertyId: true, sourceUrl: true, statusSource: true, property: { select: { title: true } } },
  });
  const deepener = makeDeepener({ pageUrl: web[0]?.url ?? "https://example.com/", maxListings: rows.length, deadline });
  let fixed = 0;
  let hidden = 0;
  let heldBack = 0; // listings left published because their source's latest run was flagged anomalous (data protection)
  let next = 0;
  const hide = async (a: { propertyId: string; statusSource: string | null }, why: string) => {
    // A source whose latest evaluated run is anomalous (blocked, structure changed, volume collapse) may also return pages
    // without prices; that must not be read as "no price exists", so the listing is kept (see sourceProtection.ts).
    const out = await removeListingFromSource(a.statusSource, { propertyId: a.propertyId, field: "thin_fix", reason: `Hidden: ${why}` });
    if (out.applied) hidden++;
    else heldBack++;
  };
  const worker = async () => {
    while (next < rows.length && Date.now() < deadline) {
      const a = rows[next++];
      const url = a.sourceUrl ? normalizeUrl(a.sourceUrl, a.sourceUrl) : null;
      if (!url || listPages.has(url)) { await hide(a, "no page of its own to read and no reserve price"); continue; }
      const res = await deepener.fromUrl(url);
      if (!res.attempted) { next--; return; } // out of time: try again on the next press
      const rec = res.records.map((r) => normalizeListing(r)).find((r) => r.reserve_price) ?? null;
      if (rec && rec.reserve_price) {
        const done = await enrichExisting({ tokens: new Set(), reserve: null, start: null, auctionId: a.id, propertyId: a.propertyId, ext: null }, rec, a.statusSource ?? "", true).catch(() => false);
        if (done) { fixed++; continue; }
      }
      await hide(a, "its own page states no reserve price");
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const left = await prisma.auction.count({ where });
  return { fixed, hidden, heldBack, left, tokens: deepener.stats.tokens };
}
