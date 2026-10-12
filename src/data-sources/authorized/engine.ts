/*
 * Generic engine for importing an AUTHORISED feed (an API, a licensed data feed or an export the site owner has approved in writing).
 * It contains no provider-specific detail: the feed client and the field mapping are given to it. Pure apart from what it is handed
 * (client, importer, cursor store, sleep, clock), so it is tested with simulated feeds.
 *
 * What it guarantees
 *   - Access denial (401 / 403 / challenge) stops the run at once, is never retried and is reported as "awaiting authorization".
 *   - Temporary errors (network, 429, 5xx) are retried with a bounded back-off, then the page is marked failed and the run stops
 *     WITHOUT losing its place: the cursor of the last good page is kept, so the next run resumes there.
 *   - An empty first page of a healthy answer is "connected, no listings", never an access problem and never "completed".
 *   - A cursor is saved after every imported page, so an interrupted job resumes instead of starting again.
 *   - Re-running never duplicates: records need a stable external id, the importer matches on it, and a record repeated inside one
 *     page is imported once.
 *   - dry mode reads and maps but imports nothing and saves nothing.
 */
import type { ListingRecord } from "@/lib/import/csvImport";

export type FeedFetchResult =
  | { kind: "ok"; records: unknown[]; nextCursor: string | null; total?: number }
  | { kind: "denied"; http: number | null; reason: string }
  | { kind: "temporary"; reason: string }
  | { kind: "invalid"; reason: string };

export interface AuthorizedFeedClient {
  fetchPage(cursor: string | null, pageSize: number): Promise<FeedFetchResult>;
}

export type SourceState = "awaiting_authorization" | "temporarily_unavailable" | "configuration_error" | "connected_no_listings" | "active" | "completed" | "partial";

export interface FeedCursor {
  /** The cursor to ask for NEXT (null = the first page). */
  cursor: string | null;
  done: boolean;
  pagesDone: number;
  discovered: number;
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  failedPages: number;
  startedAt: string;
  completedAt?: string;
  lastError?: string;
  state: SourceState;
}

export const freshFeedCursor = (now: Date = new Date()): FeedCursor => ({
  cursor: null, done: false, pagesDone: 0, discovered: 0, parsed: 0, created: 0, updated: 0, skipped: 0, rejected: 0, failedPages: 0, startedAt: now.toISOString(), state: "active",
});

export interface BatchResult { created: number; updated: number; skipped: number; failed: number }

export interface FeedRunOptions {
  client: AuthorizedFeedClient;
  /** Maps one raw record to the importer's listing record, or null when it cannot be (counted as rejected). */
  map: (raw: unknown) => ListingRecord | null;
  importBatch: (records: ListingRecord[]) => Promise<BatchResult>;
  load: () => Promise<FeedCursor | null>;
  save: (c: FeedCursor) => Promise<void>;
  mode: "dry" | "sample" | "full";
  /** sample mode: stop after this many mapped records. */
  sampleSize?: number;
  pageSize?: number;
  /** stop (as "partial") after this many pages in this run. */
  maxPages?: number;
  /** stop (as "partial") when this much time has passed in this run. */
  budgetMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** restart from the first page instead of resuming. */
  restart?: boolean;
  log?: (line: string) => void;
}

export interface FeedRunResult { cursor: FeedCursor; state: SourceState; message: string; pagesThisRun: number }

const BACKOFF_MS = [1_000, 3_000, 9_000];
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A listing needs a stable id and a link to its notice; without them it cannot be matched on a re-run. */
export function validRecord(r: ListingRecord | null): r is ListingRecord {
  return !!r && !!r.external_id && !!r.source_url && !!r.title;
}

export async function runFeedImport(o: FeedRunOptions): Promise<FeedRunResult> {
  const sleep = o.sleep ?? realSleep;
  const now = o.now ?? Date.now;
  const log = o.log ?? (() => undefined);
  const pageSize = o.pageSize ?? 100;
  const retries = Math.min(o.retries ?? 3, BACKOFF_MS.length);
  const dry = o.mode === "dry";
  const t0 = now();

  let c = (!o.restart && (await o.load())) || freshFeedCursor();
  if (c.done && !o.restart) return { cursor: c, state: "completed", message: describe(c), pagesThisRun: 0 };
  if (c.done) c = freshFeedCursor();
  c.state = "active";
  let pages = 0;
  let sampled = 0;
  const checkpoint = async () => { if (!dry) await o.save(c); };

  for (;;) {
    if (o.maxPages !== undefined && pages >= o.maxPages) { c.state = "partial"; break; }
    if (o.budgetMs !== undefined && pages > 0 && now() - t0 >= o.budgetMs) { c.state = "partial"; break; }

    // ---- fetch one page, retrying temporary trouble only ----
    let res: FeedFetchResult = await o.client.fetchPage(c.cursor, pageSize);
    for (let attempt = 0; res.kind === "temporary" && attempt < retries; attempt++) {
      log(`temporary error (${res.reason}); retry ${attempt + 1}/${retries}`);
      await sleep(BACKOFF_MS[attempt]);
      res = await o.client.fetchPage(c.cursor, pageSize);
    }

    if (res.kind === "denied") {
      c.state = "awaiting_authorization";
      c.lastError = `access denied${res.http ? ` (HTTP ${res.http})` : ""}: ${res.reason}`;
      await checkpoint();
      return { cursor: c, state: c.state, message: `Awaiting authorization: ${c.lastError}. Not retried and not worked around.`, pagesThisRun: pages };
    }
    if (res.kind === "temporary") {
      c.failedPages += 1;
      c.state = "temporarily_unavailable";
      c.lastError = `temporary error: ${res.reason}`;
      await checkpoint();
      return { cursor: c, state: c.state, message: `Temporarily unavailable: ${res.reason}. The cursor is kept; the next run resumes here.`, pagesThisRun: pages };
    }
    if (res.kind === "invalid") {
      c.failedPages += 1;
      c.state = "configuration_error";
      c.lastError = `unexpected answer: ${res.reason}`;
      await checkpoint();
      return { cursor: c, state: c.state, message: `Configuration error: ${res.reason}. Check the feed address, the field names and the answer format.`, pagesThisRun: pages };
    }

    // ---- map, validate, de-duplicate inside the page ----
    pages += 1;
    c.discovered += res.records.length;
    const seen = new Set<string>();
    const batch: ListingRecord[] = [];
    for (const raw of res.records) {
      let rec: ListingRecord | null = null;
      try { rec = o.map(raw); } catch { rec = null; }
      if (!validRecord(rec)) { c.rejected += 1; continue; }
      if (seen.has(rec.external_id!)) { c.skipped += 1; continue; }
      seen.add(rec.external_id!);
      batch.push(rec);
    }
    c.parsed += batch.length;

    let toImport = batch;
    if (o.mode === "sample") {
      const room = Math.max(0, (o.sampleSize ?? 20) - sampled);
      toImport = batch.slice(0, room);
      sampled += toImport.length;
    }
    if (!dry && toImport.length) {
      const r = await o.importBatch(toImport);
      c.created += r.created; c.updated += r.updated; c.skipped += r.skipped; c.rejected += r.failed;
    }
    c.pagesDone += 1;
    c.cursor = res.nextCursor;
    c.lastError = undefined;
    await checkpoint();
    log(`page ${c.pagesDone}: ${res.records.length} read, ${batch.length} valid`);

    if (c.pagesDone === 1 && c.discovered === 0 && res.nextCursor === null) { c.state = "connected_no_listings"; c.done = false; break; }
    if (o.mode === "sample" && sampled >= (o.sampleSize ?? 20)) { c.state = "partial"; break; }
    if (res.nextCursor === null) { c.done = true; c.completedAt = new Date(now()).toISOString(); c.state = "completed"; break; }
  }

  await checkpoint();
  return { cursor: c, state: c.state, message: describe(c), pagesThisRun: pages };
}

export function describe(c: FeedCursor): string {
  const head =
    c.state === "completed" ? "Completed" : c.state === "connected_no_listings" ? "Connected, but the feed returned no listings" : c.state === "partial" ? "Partially completed (resumable)" : c.state === "active" ? "Running" : c.state;
  return `${head}: ${c.pagesDone} page(s), ${c.discovered} discovered, ${c.parsed} valid, ${c.created} new, ${c.updated} updated, ${c.skipped} skipped, ${c.rejected} rejected, ${c.failedPages} failed page(s).`;
}
