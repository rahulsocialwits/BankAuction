import { prisma } from "@/lib/db/prisma";
import { importRecords } from "@/lib/import/csvImport";
import { freshFeedCursor, runFeedImport, type AuthorizedFeedClient, type BatchResult, type FeedCursor, type SourceState } from "./engine";
import { JsonFeedClient, type JsonFeedConfig } from "./jsonFeed";
import { makeMapper, type FieldMap } from "./fieldMap";
import { runEauctionsPages } from "../eauctionsindia/import";

/*
 * eAuctionsIndia (https://www.eauctionsindia.com). AUTOMATED ACCESS IS NOT PERMITTED today: its robots.txt answers HTTP 403 with a
 * Cloudflare challenge and the crawler was recorded as "Blocked ... CAPTCHA / challenge page" (docs/launch/SOURCE_ACCESS_STATUS.md).
 *
 * This file is the adapter for the day the site owner gives written permission, an API / licensed feed or an export. It sends NOTHING
 * until all of this is set in the environment (Vercel / your own PowerShell session):
 *     EAUCTIONS_AUTHORIZED=yes           you confirm a written authorisation exists (keep it with SOURCE_ACCESS_STATUS.md)
 *     EAUCTIONS_FEED_URL                 the feed address the owner gave
 *     EAUCTIONS_RECORDS_PATH             where the list of records is in the answer (dot path)
 *     EAUCTIONS_CURSOR_PARAM             name of the page / cursor parameter
 *     EAUCTIONS_FIELD_MAP                JSON: listing key -> path in a record (id, title, url are required)
 *   optional: EAUCTIONS_FEED_TOKEN, EAUCTIONS_FEED_AUTH_HEADER, EAUCTIONS_FEED_TOKEN_PREFIX, EAUCTIONS_PAGE_SIZE_PARAM,
 *             EAUCTIONS_NEXT_CURSOR_PATH, EAUCTIONS_PAGE_NUMBER_MODE=1, EAUCTIONS_TOTAL_PATH, EAUCTIONS_PAGE_SIZE (default 100),
 *             EAUCTIONS_MIN_INTERVAL_MIN (default 60: minutes between scheduled passes once a pass is complete).
 * The provider-specific names are configuration because the real feed specification is not known and is never guessed.
 */

export const EAUCTIONS_HOST = "eauctionsindia.com";
export const isEauctionsIndiaUrl = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, "") === EAUCTIONS_HOST; } catch { return false; }
};

export type EauctionsConfig =
  | { ready: false; state: Extract<SourceState, "awaiting_authorization" | "configuration_error">; reason: string }
  | { ready: true; client: AuthorizedFeedClient; map: ReturnType<typeof makeMapper>; pageSize: number; minIntervalMin: number };

type Env = Record<string, string | undefined>;

/** Pure: what the environment allows. Never reads the network. */
export function eauctionsConfig(env: Env = process.env, fetchFn?: typeof fetch): EauctionsConfig {
  if (env.EAUCTIONS_AUTHORIZED?.trim() !== "yes") {
    return { ready: false, state: "awaiting_authorization", reason: "No written authorisation is recorded (EAUCTIONS_AUTHORIZED is not \"yes\"). Nothing is requested from the site." };
  }
  const missing = ["EAUCTIONS_FEED_URL", "EAUCTIONS_RECORDS_PATH", "EAUCTIONS_CURSOR_PARAM", "EAUCTIONS_FIELD_MAP"].filter((k) => !env[k]?.trim());
  if (missing.length) return { ready: false, state: "configuration_error", reason: `Authorised, but not configured: ${missing.join(", ")} missing.` };
  let fieldMap: FieldMap;
  try { fieldMap = JSON.parse(env.EAUCTIONS_FIELD_MAP!) as FieldMap; } catch { return { ready: false, state: "configuration_error", reason: "EAUCTIONS_FIELD_MAP is not valid JSON." }; }
  if (!fieldMap.id || !fieldMap.title || !fieldMap.url) return { ready: false, state: "configuration_error", reason: "EAUCTIONS_FIELD_MAP must map at least id, title and url." };
  const cfg: JsonFeedConfig = {
    url: env.EAUCTIONS_FEED_URL!.trim(),
    cursorParam: env.EAUCTIONS_CURSOR_PARAM!.trim(),
    recordsPath: env.EAUCTIONS_RECORDS_PATH!.trim(),
    pageSizeParam: env.EAUCTIONS_PAGE_SIZE_PARAM?.trim() || undefined,
    nextCursorPath: env.EAUCTIONS_NEXT_CURSOR_PATH?.trim() || undefined,
    pageNumberMode: env.EAUCTIONS_PAGE_NUMBER_MODE === "1",
    totalPath: env.EAUCTIONS_TOTAL_PATH?.trim() || undefined,
    authHeader: env.EAUCTIONS_FEED_AUTH_HEADER?.trim() || undefined,
    token: env.EAUCTIONS_FEED_TOKEN?.trim() || undefined,
    tokenPrefix: env.EAUCTIONS_FEED_TOKEN_PREFIX ?? undefined,
  };
  if (!cfg.pageNumberMode && !cfg.nextCursorPath) return { ready: false, state: "configuration_error", reason: "Set EAUCTIONS_NEXT_CURSOR_PATH, or EAUCTIONS_PAGE_NUMBER_MODE=1 for a page-numbered feed." };
  return {
    ready: true,
    client: new JsonFeedClient(cfg, fetchFn),
    map: makeMapper(EAUCTIONS_HOST, fieldMap),
    pageSize: Math.max(1, Math.min(500, Number(env.EAUCTIONS_PAGE_SIZE) || 100)),
    minIntervalMin: Math.max(5, Number(env.EAUCTIONS_MIN_INTERVAL_MIN) || 60),
  };
}

const KEY = "authorizedFeed";

async function loadCursor(feedId: string): Promise<FeedCursor | null> {
  const row = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  try { const v = (row?.sheetState ? JSON.parse(row.sheetState) : {})?.[KEY]; return v && typeof v === "object" ? { ...freshFeedCursor(), ...v } : null; } catch { return null; }
}

async function saveCursor(feedId: string, c: FeedCursor, message?: string, status?: "ok" | "error") {
  const row = await prisma.feedSource.findUnique({ where: { id: feedId }, select: { sheetState: true } });
  let all: Record<string, unknown> = {};
  try { all = row?.sheetState ? JSON.parse(row.sheetState) : {}; } catch { all = {}; }
  all[KEY] = c;
  await prisma.feedSource.update({ where: { id: feedId }, data: { sheetState: JSON.stringify(all), ...(message ? { lastMessage: message.slice(0, 1500) } : {}), ...(status ? { lastStatus: status, lastRunAt: new Date() } : {}) } });
}

export interface EauctionsRunOptions {
  mode: "dry" | "sample" | "full";
  sampleSize?: number;
  budgetMs?: number;
  maxPages?: number;
  restart?: boolean;
  /** scheduled runs wait until the pass is old enough; a person running the script does not. */
  scheduled?: boolean;
  log?: (l: string) => void;
}

/**
 * One run of the authorised import for the eAuctionsIndia feed source: dry (read and map only), a small sample, or the full resumable
 * import. Without authorisation it answers at once and sends nothing.
 */
export async function runEauctionsFeed(feed: { id: string; name: string; url: string }, o: EauctionsRunOptions): Promise<{ name: string; message: string; state: SourceState }> {
  // No feed address configured: the category LIST pages are read by their own parser (eauctionsindia/import.ts), only with a recorded permission.
  if (!process.env.EAUCTIONS_FEED_URL?.trim()) {
    const r = await runEauctionsPages(feed, { mode: o.mode, sampleRecords: o.sampleSize, maxPages: o.maxPages, scheduled: o.scheduled, restart: o.restart, log: o.log });
    return { name: feed.name, message: r.message, state: r.state };
  }
  const cfg = eauctionsConfig();
  if (!cfg.ready) {
    const message = `${cfg.state === "awaiting_authorization" ? "Awaiting authorization" : "Configuration error"}: ${cfg.reason}`;
    if (o.mode !== "dry") await saveCursor(feed.id, { ...((await loadCursor(feed.id)) ?? freshFeedCursor()), state: cfg.state, lastError: cfg.reason }, message, "error");
    return { name: feed.name, message, state: cfg.state };
  }

  const existing = await loadCursor(feed.id);
  if (o.scheduled && existing?.done && existing.completedAt && Date.now() - Date.parse(existing.completedAt) < cfg.minIntervalMin * 60_000) {
    return { name: feed.name, message: `Last pass completed ${existing.completedAt}; the next one starts after ${cfg.minIntervalMin} minutes.`, state: "completed" };
  }
  // A finished pass is repeated from the start: the feed is re-read and the importer updates what changed and skips what did not.
  const restart = o.restart || (existing?.done ?? false);

  const importBatch = async (records: Parameters<typeof importRecords>[0]): Promise<BatchResult> => {
    const r = await importRecords(records, `feed:${feed.name}`, "PUBLISHED", feed.url, { enrich: true, strict: true, method: "api" });
    return { created: r.created, updated: r.updated ?? 0, skipped: Math.max(0, r.skipped - (r.updated ?? 0)), failed: r.failed };
  };
  const out = await runFeedImport({
    client: cfg.client, map: cfg.map, importBatch, load: () => loadCursor(feed.id), save: (c) => saveCursor(feed.id, c),
    mode: o.mode, sampleSize: o.sampleSize, pageSize: cfg.pageSize, budgetMs: o.budgetMs, maxPages: o.maxPages, restart, log: o.log,
  });
  if (o.mode !== "dry") await saveCursor(feed.id, out.cursor, out.message, ["completed", "partial", "active", "connected_no_listings"].includes(out.state) ? "ok" : "error");
  return { name: feed.name, message: out.message, state: out.state };
}
