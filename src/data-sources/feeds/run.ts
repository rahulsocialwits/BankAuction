import { prisma } from "@/lib/db/prisma";
import { importCsvText, importRecords, type ImportResult } from "@/lib/import/csvImport";
import { robotsCheck, scanWebPage, UA } from "./webScan";
import { POLICY_PREFIX, describeStatus, fetchWithRetry, isRefusal } from "@/lib/fetch/httpStatus";
import { logRun } from "@/lib/pipeline/runLog";
import { enrichLocations } from "@/lib/pipeline/geo";
import { importTabular, type TabState } from "@/lib/import/tabular";
import { fetchTabCsv, listSheetTabs, sheetIdFromUrl } from "./sheets";
import { acquireAiLock, aiWindow, releaseAiLock } from "@/lib/pipeline/aiSchedule";
import { checkSourceUrl, type SourceUrlCheck } from "./blockedHosts";
import { DEEP_MAX_LISTINGS, makeDeepener } from "./deepScan";
import { scanSiteForNew, webStateOf, withWebState } from "./siteScan";

/** Saved in a feed's last message while its first import is not finished; the scheduler keeps it going on every tick. */
export const MORE_PENDING = "Continues automatically.";
const CATCH_UP_WINDOW_MS = 24 * 3_600_000; // a new AI source gets full attention for its first day, then follows the AI schedule
const CATCH_UP_GAP_MS = 20 * 60_000;

// Sites whose terms or robots.txt disallow copying; never accept these as links.
// eauctionsindia.com is NOT here: its robots.txt allows crawling. If its Cloudflare returns 403 to our server, the
// run reports a technical "Blocked" for that reason alone (see BlockedError below).
// (the list lives in blockedHosts.ts so the sheet importer can apply the same rule to rows)

/** The WEBSITE refused (robots.txt, HTTP 401 / 403, CAPTCHA, anti-bot screen). We never retry or work around it; the feed is auto-paused. */
class BlockedError extends Error {}
/** OUR OWN configuration (the do-not-fetch list) refused the address. No request was made; the website did not refuse anything. */
class PolicyError extends Error {}
const MIN_INTERVAL_MS = 55 * 60 * 1000; // scheduled runs are hourly

export function validateFeedUrl(raw: string): SourceUrlCheck {
  return checkSourceUrl(raw);
}

/** Turns a normal Google Sheets link into its CSV export URL. */
export function toCsvUrl(url: string): string {
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (!m) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

function describe(out: Pick<ImportResult, "created" | "skipped" | "failed"> & { updated?: number }) {
  const dup = out.updated ? `${out.skipped} already on the site (${out.updated} of them updated with missing details)` : `${out.skipped} duplicate skipped`;
  return `${out.created} new, ${dup}, ${out.failed} rejected`;
}

/** "8 rejected" is never enough: the exact reasons of the first few, e.g. "Individual House in Guntur: reserve_price_missing, auction_date_missing". */
export function rejectionNote(list: { url?: string; title?: string; reasons: string[] }[] | undefined, max = 6): string {
  if (!list?.length) return "";
  const shown = list.slice(0, max).map((r) => `${(r.title || r.url || "listing").slice(0, 50)}: ${r.reasons.join(", ")}`);
  return ` Rejected — ${shown.join(" | ")}${list.length > max ? ` | +${list.length - max} more` : ""}.`;
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

  const total = { created: 0, skipped: 0, failed: 0, updated: 0 };
  const lines: string[] = [];
  const notProperty: string[] = [];
  let emptyTabs = 0;
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
      if (r.skippedReason === "empty tab") { emptyTabs++; continue; }
      changedTabs++;
      total.created += r.created;
      total.skipped += r.skipped;
      total.failed += r.failed;
      total.updated += r.updated ?? 0;
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
    : `${tabs.length} tab(s) read — ${describe(total)}. ${lines.join(" | ")}${lines.some((l) => /continue on the next run/.test(l)) ? ` ${MORE_PENDING}` : ""}${emptyTabs + notProperty.length ? ` | ${emptyTabs + notProperty.length} other tab(s) left alone (${emptyTabs} empty, ${notProperty.length} not property lists)` : ""}${tokens ? ` (${tokens} AI tokens)` : " (no AI tokens)"}`;
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
    if (!check.ok) throw check.status === "internal_policy_block" ? new PolicyError(check.reason) : new Error(check.reason);
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
        throw new BlockedError(`Blocked by robots.txt: this website's robots.txt does not allow automated access to this page. Paused automatically.`);
      }
      if (verdict === "unreachable") {
        // Not a refusal: the site simply did not answer properly. Stay Live and try again on the next run.
        throw new Error(`${UNREACHABLE} its robots.txt gave no answer (timeout). Some bank sites silently ignore automated requests; that is their choice and we never work around it. It is retried twice a day. Meanwhile paste the bank's public notice in Bulk Import, or ask the bank for a data feed.`);
      }
    }

    // One polite retry for 429 / 503 (Retry-After, at most 20 s). Only a real refusal (401 / 403 / CAPTCHA / anti-bot screen) blocks the source.
    const got = await fetchWithRetry(target, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), redirect: "follow" }, { onLog: (l) => console.log(`[crawler] ${feed.name}: ${l}`) });
    if (isRefusal(got.status)) throw new BlockedError(`Blocked: ${describeStatus(got.status, got.http)} Paused automatically.`);
    if (got.status !== "success" || !got.res) {
      // temporary: the source stays Live and is tried again on the next run
      const cause = !got.res ? "Could not reach the site" : describeStatus(got.status, got.http);
      throw new Error(cause.startsWith("temporary_error") || got.res ? cause : `temporary_error: ${cause}`);
    }
    const res = got.res;
    if (!res.ok) throw new Error(`temporary_error: HTTP ${res.status}`);
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
        const catchUp = !!feed.lastMessage?.includes(MORE_PENDING); // unfinished first import: the unchanged-page shortcut must not stop it
        scan = await scanWebPage(text, trigger === "schedule" && !catchUp ? [...(feed.contentHash ? [feed.contentHash] : []), ...others] : null);
      } finally {
        await releaseAiLock(lock);
      }
      newHash = scan.hash;
      tokens = scan.tokens;
      if (scan.unchanged) {
        unchanged = true;
        message = feed.contentHash === scan.hash ? "Unchanged: AI skipped (content unchanged)." : "Duplicate: AI skipped (the same content was already processed by another source).";
      } else {
        // New listings (and thin existing ones) are read in depth: their own page and notice PDFs, in one more AI call each.
        const deepener = makeDeepener({ html: text, pageUrl: check.url, siblingTitles: scan.records.map((r) => String(r.title ?? "")), deadline: Date.now() + (trigger === "manual" ? 200_000 : 150_000) });
        let out: ImportResult;
        try {
          out = await importRecords(scan.records, `feed:${feed.name}`, "PUBLISHED", check.url, { deepen: deepener, strict: true });
        } finally {
          await deepener.deps.close?.(); // the browser (if the render fallback started one) is released
        }
        stats = out;
        tokens += deepener.stats.tokens;
        const d = deepener.stats;
        const deepNote = d.attempted ? ` Deep scan: ${d.attempted} listing(s) read in full, ${d.pdfs} notice PDF(s) read, ${d.tokens} tokens${d.notes.length ? ` (${[...new Set(d.notes)].join("; ")})` : ""}.` : "";
        const rendered = deepener.deps.renderStats?.rendered ?? 0;
        message = `Scanned page (${scan.model}, ${scan.tokens} tokens), found ${scan.records.length} listing(s): ${describe(out)}${out.held ? `, ${out.held} held (no borrower name: needs_enrichment)` : ""}.${rejectionNote(out.rejections)}${rendered ? ` ${rendered} page(s) read after running their JavaScript in a browser.` : ""}${deepNote}${d.attempted >= DEEP_MAX_LISTINGS ? ` More listings are waiting for their full read. ${MORE_PENDING}` : ""}`;
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
    const policy = e instanceof PolicyError;
    const blocked = e instanceof BlockedError;
    // messages shown in the admin: "Blocked: …" / "Blocked by robots.txt" = the website refused; "Source disabled by project configuration" = our own list
    const finalMessage = blocked && !message.startsWith("Blocked") ? `Blocked: ${message}. Paused automatically.` : message;
    await prisma.feedSource.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        lastStatus: "error",
        lastMessage: finalMessage,
        ...((blocked || policy) && { active: false }),
      },
    });
    await logRun({ source: feed.name, kind: "feed", trigger, status: policy ? "policy_block" : blocked ? "blocked" : "error", aiTokens: tokens, message: finalMessage, startedAt });
    return { name: feed.name, error: message };
  }
}

/** Web pages are read by the AI. Google Sheets and CSV files are imported by code (the AI only maps unknown columns once). */
export const isAiFeed = (url: string) => !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url) && !/\.csv(\?|$)/i.test(url);

/** A site whose robots.txt never answers our crawler. It is not something we can fix from here, so it is retried only twice a day. */
export const UNREACHABLE = "Site not responding to our crawler:";
const UNREACHABLE_RETRY_MS = 12 * 3_600_000;

const SITE_SCAN_GAP_MS = 50 * 60_000; // a web source is scanned for new listings about once an hour
const SITE_SCAN_PENDING = "Site scan continues automatically.";

/**
 * Whole-site scan of a web source: look through its index pages, find every listing page, and read the NEW ones in full
 * (page + notice PDFs + one AI call each). Finding the pages costs no AI; an hour with nothing new costs no tokens.
 * Scheduled scans read at most 10 new listings; "Run" / a freshly added source reads up to 25.
 */
export async function runWebDiscovery(feedId: string, trigger: "schedule" | "manual", opts: { budgetMs?: number; all?: boolean } = {}): Promise<string | null> {
  const feed = await prisma.feedSource.findUnique({ where: { id: feedId } });
  if (!feed || !isAiFeed(feed.url)) return null;
  const check = validateFeedUrl(feed.url);
  if (!check.ok) return null;
  const state = webStateOf(feed.sheetState);
  const all = !!opts.all || !!state.importAll; // "Import all now": big batches, side by side, on every tick until nothing is left
  const pending = !!feed.lastMessage?.includes(SITE_SCAN_PENDING);
  const gap = pending ? CATCH_UP_GAP_MS : SITE_SCAN_GAP_MS;
  if (trigger === "schedule" && !all && state.lastAt && Date.now() - Date.parse(state.lastAt) < gap) return null;
  if (feed.lastMessage?.startsWith(UNREACHABLE) && feed.lastRunAt && Date.now() - feed.lastRunAt.getTime() < UNREACHABLE_RETRY_MS && trigger === "schedule") return null;
  const lock = await acquireAiLock(feed.name);
  if (!lock) return null;
  const startedAt = new Date();
  const budgetMs = opts.budgetMs ?? (all ? 270_000 : trigger === "manual" ? 200_000 : 70_000);
  try {
    const res = await scanSiteForNew({ startUrl: check.url, feedName: feed.name, seen: state.seen, maxNew: all ? 150 : trigger === "manual" ? 25 : 10, concurrency: all ? 6 : trigger === "manual" ? 4 : 3, deadline: Date.now() + budgetMs });
    const note = `Site scan: ${res.discovered} listing page(s) found, ${res.unseen} new, ${res.read} read in full (${res.import.created} new, ${res.import.skipped} already on the site, ${res.import.failed} rejected${res.import.held ? `, ${res.import.held} held for borrower name` : ""}, ${res.tokens} tokens${res.pdfs ? `, ${res.pdfs} notice PDF(s)` : ""}${res.rendered ? `, ${res.rendered} page(s) rendered in a browser` : ""}).${rejectionNote(res.rejections)}${res.pending ? ` ${SITE_SCAN_PENDING}` : ""}${res.notes.length ? ` Note: ${[...new Set(res.notes)].join("; ")}.` : ""}`;
    const fresh = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true, lastMessage: true } });
    const keep = (fresh?.lastMessage ?? "").split(" | Site scan:")[0].replace(SITE_SCAN_PENDING, "").replace("Importing all properties of this website…", "").replace(/^[\s|]+/, "").trim();
    await prisma.feedSource.update({
      where: { id: feedId },
      data: { sheetState: withWebState(fresh?.sheetState, { seen: res.seen, lastAt: new Date().toISOString(), importAll: all ? res.pending : false }), lastMessage: `${keep} | ${note}`.slice(0, 1800) },
    });
    // An hour in which nothing new appeared is not worth a history row.
    if (res.read > 0 || res.import.created > 0 || res.discovered === 0) await logRun({ source: feed.name, kind: "feed", trigger, status: "ok", created: res.import.created, duplicates: res.import.skipped, rejected: res.import.failed, aiTokens: res.tokens, message: note, startedAt });
    if (res.import.created > 0 && (trigger === "manual" || aiWindow().open)) await enrichLocations(30).catch(() => null);
    return note;
  } catch (e) {
    await logRun({ source: feed.name, kind: "feed", trigger, status: "error", message: `Site scan failed: ${e instanceof Error ? e.message : String(e)}`, startedAt });
    return null;
  } finally {
    await releaseAiLock(lock);
  }
}

/** What "Add", "Run" and "Pause → Run" start: the normal import of the source, then (for a website) the whole-site scan. */
export async function runFeedFull(id: string) {
  const result = await runFeedSource(id, "manual");
  await runWebDiscovery(id, "manual").catch(() => null);
  return result;
}

/**
 * Scheduled run.
 *  - AI sources (web pages) run only inside the AI schedule (`aiSlotStart` set) and at most once per slot.
 *  - Sheet / CSV sources keep their hourly throttle.
 * `deferred` counts AI sources that are waiting for the next AI slot.
 */
export async function runAllFeeds(opts: { aiSlotStart?: Date | null } = {}) {
  const feeds = await prisma.feedSource.findMany({ where: { active: true }, select: { id: true, url: true, lastRunAt: true, lastMessage: true, lastStatus: true, createdAt: true } });
  const results = [];
  let deferred = 0;

  // Whole-site scan of every website source (about once an hour each; the one waiting longest goes first). It is capped
  // per tick so the scheduler never overruns its time; a source skipped now simply goes first next tick.
  const scanBudgetEnd = Date.now() + 130_000;
  const web = feeds.filter((f) => isAiFeed(f.url));
  const order = await prisma.feedSource.findMany({ where: { id: { in: web.map((w) => w.id) } }, select: { id: true, sheetState: true } });
  const lastScan = new Map(order.map((o) => [o.id, webStateOf(o.sheetState).lastAt ? Date.parse(webStateOf(o.sheetState).lastAt as string) : 0]));
  for (const f of [...web].sort((a, b) => (lastScan.get(a.id) ?? 0) - (lastScan.get(b.id) ?? 0))) {
    const left = scanBudgetEnd - Date.now();
    if (left < 25_000) break;
    const importing = webStateOf(order.find((o) => o.id === f.id)?.sheetState).importAll; // "Import all now" feeds get a long turn
    await runWebDiscovery(f.id, "schedule", { budgetMs: Math.min(left, importing ? 200_000 : 60_000) }).catch(() => null);
  }

  for (const f of feeds) {
    // A site that never answered our crawler is retried twice a day, not on every tick.
    if (f.lastMessage?.startsWith(UNREACHABLE) && f.lastRunAt && Date.now() - f.lastRunAt.getTime() < UNREACHABLE_RETRY_MS) continue;
    // A source whose first import is not finished keeps going on every tick (AI sources only during their first day).
    const unfinished = !!f.lastMessage?.includes(MORE_PENDING) && f.lastStatus === "ok" && (!f.lastRunAt || Date.now() - f.lastRunAt.getTime() >= CATCH_UP_GAP_MS);
    const catchUp = unfinished && (!isAiFeed(f.url) || Date.now() - f.createdAt.getTime() < CATCH_UP_WINDOW_MS);
    if (catchUp) {
      results.push(await runFeedSource(f.id, "schedule"));
      continue;
    }
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
