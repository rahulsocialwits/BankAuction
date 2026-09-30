import { prisma } from "@/lib/db/prisma";
import { importCsvText } from "@/lib/import/csvImport";

// Sites whose terms or robots.txt disallow copying; never accept these as feeds.
const BLOCKED_HOSTS = ["baanknet.com", "auctionbazaar.com", "bankauction.co"];

export function validateFeedUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "Invalid URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links are allowed" };
  if (BLOCKED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
    return { ok: false, reason: "This site does not permit copying its content" };
  }
  return { ok: true, url: u.toString() };
}

/** Turns a normal Google Sheets link into its CSV export URL. */
export function toCsvUrl(url: string): string {
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (!m) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

export async function runFeedSource(id: string) {
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (!feed) return null;
  try {
    const check = validateFeedUrl(feed.url);
    if (!check.ok) throw new Error(check.reason);
    const res = await fetch(toCsvUrl(check.url), {
      headers: { "User-Agent": "BankAuctionBot/1.0 (+https://auction.bizsocio.com)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.trimStart().startsWith("<")) throw new Error("Link returned a web page, not CSV. Publish the sheet or use a direct .csv link.");
    const out = await importCsvText(text, `feed:${feed.name}`);
    if (out.error) throw new Error('CSV must have a header row with a "title" column');
    await prisma.feedSource.update({
      where: { id },
      data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: `${out.created} new, ${out.skipped} duplicate, ${out.failed} failed` },
    });
    return { name: feed.name, ...out };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.feedSource.update({ where: { id }, data: { lastRunAt: new Date(), lastStatus: "error", lastMessage: message } });
    return { name: feed.name, error: message };
  }
}

export async function runAllFeeds() {
  const feeds = await prisma.feedSource.findMany({ where: { active: true }, select: { id: true } });
  const results = [];
  for (const f of feeds) results.push(await runFeedSource(f.id));
  return results;
}
