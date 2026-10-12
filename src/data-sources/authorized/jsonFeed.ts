import type { AuthorizedFeedClient, FeedFetchResult } from "./engine";

/*
 * A generic client for a JSON API / feed that the site owner has authorised. NOTHING here is specific to eAuctionsIndia: the address,
 * the parameter names and the places of the records / next cursor / total inside the answer are all configuration, because the real
 * feed specification is not known yet and must not be guessed. It identifies itself honestly and never reads a page it is not
 * given: a CAPTCHA / challenge / access-denied answer is "denied", not data.
 */

export interface JsonFeedConfig {
  /** Feed address (an API endpoint the owner gave us). */
  url: string;
  /** Header used for the credential, e.g. "Authorization" or "x-api-key". The value comes from `token`, never from code. */
  authHeader?: string;
  token?: string;
  /** Prefix of the credential value, e.g. "Bearer ". */
  tokenPrefix?: string;
  /** Query-string name of the cursor / page number, and of the page size. */
  cursorParam: string;
  pageSizeParam?: string;
  /** Dot paths inside the JSON answer. */
  recordsPath: string;
  nextCursorPath?: string;
  /** If the feed has no next-cursor, the cursor is a page number and the feed ends on a short or empty page. */
  pageNumberMode?: boolean;
  firstPage?: number;
  totalPath?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export const UA = "BankAuctionBot/1.0 (+https://auction.bizsocio.com)";

/** Reads "a.b.c" from an object; undefined when a step is missing. */
export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const CHALLENGE = /just a moment|captcha|cf-chl|challenge-platform|verify you are (a )?human|access denied|attention required/i;

export class JsonFeedClient implements AuthorizedFeedClient {
  constructor(private cfg: JsonFeedConfig, private fetchFn: typeof fetch = fetch) {}

  async fetchPage(cursor: string | null, pageSize: number): Promise<FeedFetchResult> {
    const c = this.cfg;
    let url: URL;
    try { url = new URL(c.url); } catch { return { kind: "invalid", reason: "the feed address is not a valid URL" }; }
    const first = c.firstPage ?? 1;
    url.searchParams.set(c.cursorParam, cursor ?? (c.pageNumberMode ? String(first) : ""));
    if (cursor === null && !c.pageNumberMode) url.searchParams.delete(c.cursorParam);
    if (c.pageSizeParam) url.searchParams.set(c.pageSizeParam, String(pageSize));

    const headers: Record<string, string> = { "User-Agent": c.userAgent ?? UA, Accept: "application/json" };
    if (c.authHeader && c.token) headers[c.authHeader] = `${c.tokenPrefix ?? ""}${c.token}`;

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), { headers, signal: AbortSignal.timeout(c.timeoutMs ?? 30_000) });
    } catch (e) {
      return { kind: "temporary", reason: e instanceof Error ? e.message.slice(0, 120) : "no answer" };
    }
    if (res.status === 401 || res.status === 403) return { kind: "denied", http: res.status, reason: "the feed refused the request" };
    if (res.status === 429 || res.status === 503 || res.status >= 500) return { kind: "temporary", reason: `HTTP ${res.status}` };
    if (!res.ok) return { kind: "invalid", reason: `HTTP ${res.status}` };

    const text = await res.text();
    const type = res.headers.get("content-type") ?? "";
    if (/html/i.test(type) || /^\s*</.test(text)) {
      return CHALLENGE.test(text) ? { kind: "denied", http: res.status, reason: "a verification / challenge page was returned instead of data" } : { kind: "invalid", reason: "an HTML page was returned instead of JSON" };
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { return { kind: "invalid", reason: "the answer is not valid JSON" }; }

    const records = getPath(body, c.recordsPath);
    if (!Array.isArray(records)) return { kind: "invalid", reason: `no list of records at "${c.recordsPath}"` };

    let next: string | null = null;
    if (c.pageNumberMode) {
      const current = Number(cursor ?? first);
      next = records.length > 0 && records.length >= pageSize ? String(current + 1) : null;
    } else {
      const n = getPath(body, c.nextCursorPath);
      next = n === undefined || n === null || n === "" ? null : String(n);
    }
    const total = Number(getPath(body, c.totalPath));
    return { kind: "ok", records, nextCursor: next, ...(Number.isFinite(total) ? { total } : {}) };
  }
}
