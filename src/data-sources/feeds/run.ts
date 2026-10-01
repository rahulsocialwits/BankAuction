import { prisma } from "@/lib/db/prisma";
import { importCsvText, importRecords, type ImportResult } from "@/lib/import/csvImport";
import { robotsAllows, scanWebPage, UA } from "./webScan";
import { logRun } from "@/lib/pipeline/runLog";
import { enrichLocations } from "@/lib/pipeline/geo";
import { importTabular, type TabState } from "@/lib/import/tabular";
import { fetchTabCsv, listSheetTabs, sheetIdFromUrl } from "./sheets";

// Sites whose terms or robots.txt disallow copying; never accept these as links.
const BLOCKED_HOSTS = ["baanknet.com", "auctionbazaar.com", "bankauction.co", "eauctionsindia.com"];

const BLOCKED_REASON = "This website refuses automated access (its terms or anti-bot protection)";

/** Access is refused by the site (robots.txt, terms, anti-bot). We never retry or work around it; the feed is auto-paused. */
class BlockedError extends Error {}
const MIN_INTERVAL_MS = 55 * 60 * 1000; // scheduled runs are hourly

export function validateFeedUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "Invalid URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links are allowed" };
  if (BLOCKED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
    return { ok: false, reason: BLOCKED_REASON };
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

function describe(out: Pick<ImportResult, "created" | "skipped" | "failed">) {
  return `${out.created} new, ${out.skipped} duplicate skipped, ${out.failed} rejected`;
}

const safeJson = (s: string | null | undefined): { tabs?: Record<string, unknown> } | null => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

/** Reads every tab of a shared Google Sheet and imports the property rows, whatever the column names are. */
async function runSheet(sheetState: string | null, feedName: string, url: string, trigger: "schedule" | "manual") {
  const id = sheetIdFromUrl(url)!;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? null;
  const state = (safeJson(sheetState)?.tabs ?? {}) as Record<string, TabState>;
  const tabs = await listSheetTabs(id, gid);

  const total = { created: 0, skipped: 0, failed: 0 };
  const lines: string[] = [];
  let tokens = 0;
  let changedTabs = 0;
  let errors = 0;
  for (const tab of tabs) {
    try {
      const csv = await fetchTabCsv(id, tab.gid);
      const r = await importTabular(csv, `feed:${feedName}`, { sourceUrl: url, state: state[tab.gid], force: trigger === "manual" });
      state[tab.gid] = r.state;
      tokens += r.tokens;
      if (r.unchanged) continue;
      changedTabs++;
      total.created += r.created;
      total.skipped += r.skipped;
      total.failed += r.failed;
      lines.push(`${tab.name}: ${r.skippedReason ? `skipped (${r.skippedReason})` : describe(r)}`);
    } catch (e) {
      errors++;
      lines.push(`${tab.name}: ${e instanceof Error ? e.message : String(e)}`);
      if (errors === 1 && tabs.length === 1) throw e; // a single-tab sheet that cannot be read is an error, not a remark
    }
  }
  if (errors === tabs.length) throw new Error(lines[0] ?? "Could not read the sheet");

  const unchanged = changedTabs === 0 && errors === 0;
  const message = unchanged
    ? `No changes in any of the ${tabs.length} tab(s) (checked automatically).`
    : `${tabs.length} tab(s) read — ${describe(total)}. ${lines.join(" | ")}${tokens ? ` (${tokens} AI tokens)` : ""}`;
  return { stats: total, tokens, unchanged, message, stateJson: JSON.stringify({ tabs: state }) };
}

export async function runFeedSource(id: string, trigger: "schedule" | "manual" = "manual") {
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (!feed) return null;
  const startedAt = new Date();
  let stats: Pick<ImportResult, "created" | "skipped" | "failed"> = { created: 0, skipped: 0, failed: 0 };
  let tokens = 0;
  let unchanged = false;
  let newHash: string | undefined;
  let sheetStateOut: string | undefined;
  try {
    const check = validateFeedUrl(feed.url);
    if (!check.ok) throw new Error(check.reason);
    const isSheet = check.url.startsWith("https://docs.google.com/spreadsheets/");
    const target = toCsvUrl(check.url);

    // Google Sheet: read EVERY tab, let the AI map each tab's columns, import the rows (see sheets.ts / tabular.ts).
    if (isSheet) {
      const sheet = await runSheet(feed.sheetState, feed.name, check.url, trigger);
      stats = sheet.stats;
      tokens += sheet.tokens;
      unchanged = sheet.unchanged;
      const message = sheet.message;
      await prisma.feedSource.update({
        where: { id },
        data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: message, sheetState: sheet.stateJson },
      });
      if (stats.created > 0) {
        const geo = await enrichLocations(60).catch(() => null);
        tokens += geo?.tokens ?? 0;
      }
      if (!unchanged) await logRun({ source: feed.name, kind: "feed", trigger, status: "ok", created: stats.created, duplicates: stats.skipped, rejected: stats.failed, aiTokens: tokens, message, startedAt });
      return { name: feed.name, message };
    }

    // Plain web pages must be allowed by the site's robots.txt; CSV links are data the owner shared.
    const looksCsv = /\.csv(\?|$)/i.test(target);
    if (!looksCsv && !(await robotsAllows(target))) {
      throw new BlockedError("Blocked: this site's robots.txt does not allow automated access to this page. Paused automatically.");
    }

    let res: Response;
    try {
      res = await fetch(target, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new Error(`Could not reach the site (${cause?.code ?? cause?.message ?? "network error"})`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new BlockedError(`Blocked: the site refuses automated access (HTTP ${res.status}, likely anti-bot protection). Paused automatically.`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isHtml = text.trimStart().startsWith("<") || (res.headers.get("content-type") ?? "").includes("html");

    let message: string;
    if (!isHtml) {
      // A CSV file: our template goes straight in, any other layout is mapped by the AI.
      const prev = (safeJson(feed.sheetState)?.tabs ?? {}).csv as TabState | undefined;
      const out = await importTabular(text, `feed:${feed.name}`, { sourceUrl: check.url, state: prev, force: trigger === "manual" });
      tokens += out.tokens;
      stats = out;
      if (out.unchanged) {
        unchanged = true;
        message = "No changes since the last check (checked automatically).";
      } else {
        message = out.skippedReason ? `Skipped: ${out.skippedReason}` : `${describe(out)}${out.usedAi ? ` (columns mapped by AI, ${out.tokens} tokens)` : ""}`;
      }
      sheetStateOut = JSON.stringify({ tabs: { csv: out.state } });
    } else {
      // Scheduled runs skip the AI when the page text is identical to last time; "Run now" always re-reads.
      const scan = await scanWebPage(text, trigger === "schedule" ? feed.contentHash : null);
      newHash = scan.hash;
      tokens = scan.tokens;
      if (scan.unchanged) {
        unchanged = true;
        message = "No changes since the last check (checked automatically).";
      } else {
        const out = await importRecords(scan.records, `feed:${feed.name}`, "PUBLISHED", check.url);
        stats = out;
        message = `Scanned page (${scan.model}, ${scan.tokens} tokens), found ${scan.records.length} listing(s): ${describe(out)}`;
      }
    }

    await prisma.feedSource.update({
      where: { id },
      data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: message, ...(newHash && { contentHash: newHash }), ...(sheetStateOut && { sheetState: sheetStateOut }) },
    });
    if (stats.created > 0) {
      const geo = await enrichLocations(30).catch(() => null);
      tokens += geo?.tokens ?? 0;
    }
    // Hourly "nothing changed" checks are not worth a history row each; they would bury the real runs.
    if (!unchanged) await logRun({ source: feed.name, kind: "feed", trigger, status: "ok", created: stats.created, duplicates: stats.skipped, rejected: stats.failed, aiTokens: tokens, message, startedAt });
    return { name: feed.name, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const blocked = e instanceof BlockedError || message === BLOCKED_REASON;
    const finalMessage = blocked && !message.startsWith("Blocked") ? `Blocked: ${message}. Paused automatically.` : message;
    await prisma.feedSource.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        lastStatus: "error",
        lastMessage: finalMessage,
        ...(blocked && { active: false }),
      },
    });
    await logRun({ source: feed.name, kind: "feed", trigger, status: blocked ? "blocked" : "error", aiTokens: tokens, message: finalMessage, startedAt });
    return { name: feed.name, error: message };
  }
}

/** Scheduled run: only feeds not run in the last ~hour. */
export async function runAllFeeds() {
  const feeds = await prisma.feedSource.findMany({ where: { active: true }, select: { id: true, lastRunAt: true } });
  const results = [];
  for (const f of feeds) {
    if (f.lastRunAt && Date.now() - f.lastRunAt.getTime() < MIN_INTERVAL_MS) continue;
    results.push(await runFeedSource(f.id, "schedule"));
  }
  return results;
}
