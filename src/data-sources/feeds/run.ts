import { prisma } from "@/lib/db/prisma";
import { importCsvText, importRecords, type ImportResult } from "@/lib/import/csvImport";
import { robotsAllows, scanWebPage, UA } from "./webScan";

// Sites whose terms or robots.txt disallow copying; never accept these as links.
const BLOCKED_HOSTS = ["baanknet.com", "auctionbazaar.com", "bankauction.co"];
const MIN_INTERVAL_MS = 55 * 60 * 1000; // scheduled runs are hourly

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

function describe(out: ImportResult) {
  return `${out.created} new, ${out.skipped} duplicate skipped, ${out.failed} rejected`;
}

export async function runFeedSource(id: string) {
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (!feed) return null;
  try {
    const check = validateFeedUrl(feed.url);
    if (!check.ok) throw new Error(check.reason);
    const isSheet = check.url.startsWith("https://docs.google.com/spreadsheets/");
    const target = toCsvUrl(check.url);

    // Plain web pages must be allowed by the site's robots.txt; Sheets/CSV links are data the owner shared.
    const looksCsv = isSheet || /\.csv(\?|$)/i.test(target);
    if (!looksCsv && !(await robotsAllows(target))) {
      throw new Error("Blocked: this site's robots.txt does not allow automated access to this page");
    }

    let res: Response;
    try {
      res = await fetch(target, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new Error(`Could not reach the site (${cause?.code ?? cause?.message ?? "network error"})`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isHtml = text.trimStart().startsWith("<") || (res.headers.get("content-type") ?? "").includes("html");

    let message: string;
    if (!isHtml) {
      const out = await importCsvText(text, `feed:${feed.name}`);
      if (out.error) throw new Error('CSV must have a header row with a "title" column');
      message = describe(out);
    } else {
      if (isSheet) throw new Error("Sheet is not public. Use File → Share → Publish to web, or set it to 'Anyone with the link'.");
      const records = await scanWebPage(text);
      const out = await importRecords(records, `feed:${feed.name}`, "PUBLISHED", check.url);
      message = `Scanned page, found ${records.length} listing(s): ${describe(out)}`;
    }

    await prisma.feedSource.update({ where: { id }, data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: message } });
    return { name: feed.name, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.feedSource.update({ where: { id }, data: { lastRunAt: new Date(), lastStatus: "error", lastMessage: message } });
    return { name: feed.name, error: message };
  }
}

/** Scheduled run: only feeds not run in the last ~hour. */
export async function runAllFeeds() {
  const feeds = await prisma.feedSource.findMany({ where: { active: true }, select: { id: true, lastRunAt: true } });
  const results = [];
  for (const f of feeds) {
    if (f.lastRunAt && Date.now() - f.lastRunAt.getTime() < MIN_INTERVAL_MS) continue;
    results.push(await runFeedSource(f.id));
  }
  return results;
}
