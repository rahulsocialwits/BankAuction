import { prisma } from "@/lib/db/prisma";
import { importCsvText, importRecords, type ImportResult } from "@/lib/import/csvImport";
import { robotsCheck, scanWebPage, UA } from "./webScan";
import { logRun } from "@/lib/pipeline/runLog";
import { enrichLocations } from "@/lib/pipeline/geo";
import { importTabular, type TabState } from "@/lib/import/tabular";
import { fetchTabCsv, listSheetTabs, sheetIdFromUrl } from "./sheets";
import { acquireAiLock, aiWindow, releaseAiLock } from "@/lib/pipeline/aiSchedule";
import { isBlockedHost } from "./blockedHosts";

// Sites whose terms or robots.txt disallow copying; never accept these as links.
// eauctionsindia.com is NOT here: its robots.txt allows crawling. If its Cloudflare returns 403 to our server, the
// run reports a technical "Blocked" for that reason alone (see BlockedError below).
// (the list lives in blockedHosts.ts so the sheet importer can apply the same rule to rows)

const BLOCKED_REASON = "This website refuses automated access (its terms or anti-bot protection)";

/** Access is refused by the site (robots.txt, terms, anti-bot). We never retry or work around it; the feed is auto-paused. */
class BlockedError extends Error {}
const MIN_INTERVAL_MS = 55 * 60 * 1000; // scheduled runs are hourly

export function validateFeedUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "Invalid URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links are allowed" };
  if (isBlockedHost(u.hostname)) {
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
  // A tab called "Properties" goes first (clean data); the Auctions tab, if any, supplies each property's auction details.
  const tabs = (await listSheetTabs(id, gid)).sort((a, b) => Number(/^properties$/i.test(b.name)) - Number(/^properties$/i.test(a.name)));
  const auctionsTab = tabs.find((t) => /^auctions?$/i.test(t.name));
  const auctionsCsv = auctionsTab && tabs.length > 1 ? await fetchTabCsv(id, auctionsTab.gid).catch(() => undefined) : undefined;
  // One run never exceeds its time budget; a big tab continues from its saved cursor on the next run.
  const deadline = Date.now() + (trigger === "manual" ? 240_000 : 100_000);

  const total = { created: 0, skipped: 0, failed: 0 };
  const lines: string[] = [];
  const notProperty: string[] = [];
  let tokens = 0;
  let changedTabs = 0;
  let errors = 0;
  for (const tab of tabs) {
    try {
      const csv = await fetchTabCsv(id, tab.gid);
      const r = await importTabular(csv, `feed:${feedName}`, { sourceUrl: url, state: state[tab.gid], force: trigger === "manual", budgetMs: Math.max(0, deadline - Date.now()), auctionsCsv });
      state[tab.gid] = r.state;
      tokens += r.tokens;
      if (r.unchanged) continue;
      if (r.skippedReason && /not a property list/i.test(r.skippedReason)) { notProperty.push(tab.name); continue; }
      changedTabs++;
      total.created += r.created;
      total.skipped += r.skipped;
      total.failed += r.failed;
      const more = r.remaining ? `; ${r.remaining.toLocaleString("en-IN")} row(s) continue on the next run` : "";
      const left = r.notes ? `; left out: ${r.notes}` : "";
      lines.push(`${tab.name}: ${r.skippedReason ? `skipped (${r.skippedReason})` : describe(r)}${left}${more}`);
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
    : `${tabs.length} tab(s) read — ${describe(total)}. ${lines.join(" | ")}${notProperty.length ? ` | ${notProperty.length} other tab(s) are not property lists and were left alone` : ""}${tokens ? ` (${tokens} AI tokens)` : " (no AI tokens)"}`;
  return { stats: total, tokens, unchanged, message, stateJson: JSON.stringify({ tabs: state }) };
}

export async function runFeedSource(id: string, trigger: "schedule" | "manual" = "manual") {
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (!feed) return null;
  const startedAt = new Date();
  let stats: Pick<ImportResult, "created" | "skipped" | "failed"> = { created: 0, skipped: 0, failed: 0 };
  let tokens = 0;
  let unchanged = false;
  let aiFeed = false; // a web page read through the AI (these are logged even when nothing changed: at most 4 a day)
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
      if (stats.created > 0 && (trigger === "manual" || aiWindow().open)) {
        const geo = await enrichLocations(60).catch(() => null);
        tokens += geo?.tokens ?? 0;
      }
      if (!unchanged) await logRun({ source: feed.name, kind: "feed", trigger, status: "ok", created: stats.created, duplicates: stats.skipped, rejected: stats.failed, aiTokens: tokens, message, startedAt });
      return { name: feed.name, message };
    }

    // Plain web pages must be allowed by the site's robots.txt; CSV links are data the owner shared.
    const looksCsv = /\.csv(\?|$)/i.test(target);
    if (!looksCsv) {
      const verdict = await robotsCheck(target);
      if (verdict === "disallowed") {
        throw new BlockedError("Blocked: this site's robots.txt says automated access to this page is not allowed. Paused automatically.");
      }
      if (verdict === "unreachable") {
        // Not a refusal: the site simply did not answer properly. Stay Live and try again on the next run.
        throw new Error("The site did not answer (timeout or server error) while checking its robots.txt. It will be tried again automatically.");
      }
    }

    let res: Response;
    try {
      res = await fetch(target, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new Error(`Could not reach the site (${cause?.code ?? cause?.message ?? "network error"})`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new BlockedError(`Blocked: the site answered HTTP ${res.status} to our server (usually anti-bot protection such as Cloudflare). Paused automatically.`);
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
      // Scheduled runs skip the AI when the page text is identical to last time, or identical to a page another source
      // already processed; "Run now" always re-reads. Only one AI scan of a source runs at a time.
      aiFeed = true;
      const lock = await acquireAiLock(feed.name);
      if (!lock) {
        const skipped = "Skipped: previous AI run still active (AI not called).";
        await logRun({ source: feed.name, kind: "feed", trigger, status: "skipped", message: `${skipped} · ai_called=false`, startedAt });
        return { name: feed.name, message: skipped };
      }
      let scan: Awaited<ReturnType<typeof scanWebPage>>;
      try {
        const others =
          trigger === "schedule"
            ? (await prisma.feedSource.findMany({ where: { id: { not: feed.id }, contentHash: { not: null } }, select: { contentHash: true } })).map((o) => o.contentHash as string)
            : [];
        scan = await scanWebPage(text, trigger === "schedule" ? [...(feed.contentHash ? [feed.contentHash] : []), ...others] : null);
      } finally {
        await releaseAiLock(lock);
      }
      newHash = scan.hash;
      tokens = scan.tokens;
      if (scan.unchanged) {
        unchanged = true;
        message = feed.contentHash === scan.hash ? "Unchanged: AI skipped (content unchanged)." : "Duplicate: AI skipped (the same content was already processed by another source).";
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
    if (stats.created > 0 && (trigger === "manual" || aiWindow().open)) {
      const geo = await enrichLocations(30).catch(() => null);
      tokens += geo?.tokens ?? 0;
    }
    // Hourly "nothing changed" checks of CSV/Sheet links are not worth a history row each; they would bury the real runs.
    // AI page scans run at most 4 times a day, so even an unchanged one is recorded (status skipped, AI not called).
    if (!unchanged) await logRun({ source: feed.name, kind: "feed", trigger, status: "ok", created: stats.created, duplicates: stats.skipped, rejected: stats.failed, aiTokens: tokens, message, startedAt });
    else if (aiFeed) await logRun({ source: feed.name, kind: "feed", trigger, status: "skipped", aiTokens: 0, message: `${message} · ai_called=false`, startedAt });
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

/** Web pages are read by the AI. Google Sheets and CSV files are imported by code (the AI only maps unknown columns once). */
const isAiFeed = (url: string) => !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url) && !/\.csv(\?|$)/i.test(url);

/**
 * Scheduled run.
 *  - AI sources (web pages) run only inside the AI schedule (`aiSlotStart` set) and at most once per slot.
 *  - Sheet / CSV sources keep their hourly throttle.
 * `deferred` counts AI sources that are waiting for the next AI slot.
 */
export async function runAllFeeds(opts: { aiSlotStart?: Date | null } = {}) {
  const feeds = await prisma.feedSource.findMany({ where: { active: true }, select: { id: true, url: true, lastRunAt: true } });
  const results = [];
  let deferred = 0;
  for (const f of feeds) {
    if (isAiFeed(f.url)) {
      const slot = opts.aiSlotStart ?? null;
      if (!slot || (f.lastRunAt && f.lastRunAt >= slot)) {
        if (!slot) deferred++;
        continue;
      }
    } else if (f.lastRunAt && Date.now() - f.lastRunAt.getTime() < MIN_INTERVAL_MS) continue;
    results.push(await runFeedSource(f.id, "schedule"));
  }
  return Object.assign(results, { deferred });
}
