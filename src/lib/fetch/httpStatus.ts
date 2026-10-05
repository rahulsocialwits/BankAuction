/*
 * Honest classification of what a website answered, and ONE polite retry for temporary answers.
 *
 *   success              2xx page
 *   rate_limited         429 (still 429 after the one allowed retry)       -> temporary, source stays Live
 *   service_unavailable  503 (still 503 after the one allowed retry)       -> temporary, source stays Live
 *   temporary_error      network error, timeout, 5xx, other odd statuses   -> temporary, source stays Live
 *   unauthorized         401                                               -> refusal (Blocked)
 *   forbidden            403                                               -> refusal (Blocked)
 *   captcha              CAPTCHA / challenge / explicit anti-bot screen    -> refusal (Blocked)
 *   blocked              any other explicit "access denied" page           -> refusal (Blocked)
 *   robots_disallowed    robots.txt says no                                -> refusal, request is never made
 *
 * Nothing here evades anything: no CAPTCHA solving, no proxies, no user-agent changes, and a refusal is never retried.
 * The only second attempt is the single, Retry-After-respecting retry of 429 / 503 (wait at most 20 seconds).
 */

export type FetchStatus =
  | "success"
  | "temporary_error"
  | "rate_limited"
  | "service_unavailable"
  | "blocked"
  | "captcha"
  | "unauthorized"
  | "forbidden"
  | "robots_disallowed";

/** Statuses that are real refusals: the page / source stops and is marked Blocked. Everything else is temporary. */
export const REFUSALS: readonly FetchStatus[] = ["blocked", "captcha", "unauthorized", "forbidden", "robots_disallowed"];
export const isRefusal = (s: FetchStatus) => REFUSALS.includes(s);

export const MAX_RETRY_WAIT_SEC = 20;
/** Used when a 429 / 503 carries no usable Retry-After header. */
export const DEFAULT_RETRY_DELAY_SEC = 5;

/** "8" -> 8, an HTTP date -> seconds until then, anything else (or negative) -> null. Not capped here. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  const sec = (at - now) / 1000;
  return sec >= 0 ? sec : 0;
}

const CAPTCHA_PAGE = /(g-recaptcha|h-captcha|hcaptcha|cf-turnstile|captcha-delivery|px-captcha|please solve the captcha|are you a robot|are you a human|verify you are (a )?human|cf-chl-|cf-browser-verification|<title>\s*just a moment|<title>\s*attention required)/i;
const DENIED_PAGE = /(<title>\s*access denied|errors\.edgesuite\.net|request blocked|you have been blocked|automated (access|requests?) (is|are) (not allowed|prohibited)|unusual traffic from your)/i;

/**
 * What a page body tells about an anti-bot screen. A normal page (HTTP 200) that merely contains a reCAPTCHA box in a contact
 * form must not count, so for a 2xx answer only a SMALL page (a challenge screen is tiny) is judged.
 */
export function classifyBody(body: string, status = 403): "captcha" | "blocked" | null {
  if (status >= 200 && status < 300 && body.length >= 20_000) return null;
  const head = body.slice(0, 40_000);
  if (CAPTCHA_PAGE.test(head)) return "captcha";
  if (DENIED_PAGE.test(head)) return "blocked";
  return null;
}

/** The status of one response. `body` is optional; with it, a 200 / 403 / 429 / 503 anti-bot screen is recognised. */
export function classifyResponse(status: number, headers: { get(name: string): string | null }, body?: string): FetchStatus {
  if (headers.get("cf-mitigated") === "challenge") return "captcha";
  const fromBody = body ? classifyBody(body, status) : null;
  if (status === 401) return "unauthorized";
  if (status === 403) return fromBody === "captcha" ? "captcha" : "forbidden";
  if (status === 429) return fromBody === "captcha" ? "captcha" : "rate_limited";
  if (status === 503) return fromBody === "captcha" ? "captcha" : "service_unavailable";
  if (status >= 200 && status < 300) return fromBody ?? "success";
  if (status >= 300 && status < 400) return "success"; // redirects are followed or handled by the caller
  return "temporary_error";
}

export interface FetchOutcome {
  status: FetchStatus;
  /** The last response (null after a network error). A refused / failed response is returned too, so callers can read its status. */
  res: Response | null;
  /** HTTP status of the last response (null after a network error). */
  http: number | null;
  /** 1 or 2 */
  attempts: number;
  waitedSec: number;
  /** One line per notable event, in the exact wording of the run log. */
  log: string[];
}

export interface RetryOptions {
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  defaultDelaySec?: number;
  maxWaitSec?: number;
  /** Receives every log line as it happens. */
  onLog?: (line: string) => void;
  /** Read the body (of a clone) to recognise CAPTCHA / anti-bot pages. Default true. */
  inspectBody?: boolean;
}

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function once(url: string, init: RequestInit, o: RetryOptions): Promise<{ res: Response | null; status: FetchStatus }> {
  let res: Response;
  try {
    res = await (o.fetchFn ?? ((u, i) => fetch(u, i)))(url, init);
  } catch {
    return { res: null, status: "temporary_error" };
  }
  let body: string | undefined;
  const type = res.headers.get("content-type") ?? "";
  if (o.inspectBody !== false && (!type || /html|text/i.test(type))) {
    try { body = (await res.clone().text()).slice(0, 40_000); } catch { /* unreadable body: classify by status alone */ }
  }
  return { res, status: classifyResponse(res.status, res.headers, body) };
}

/**
 * GET with the project's one retry rule:
 *   429 / 503 -> read Retry-After (seconds or HTTP date, else the default delay), wait at most `maxWaitSec` (20), retry EXACTLY once.
 * A retry that succeeds is returned as a normal success. A second 429 / 503 is returned as rate_limited / service_unavailable
 * (a temporary state, never "blocked"). 401 / 403 / CAPTCHA are never retried.
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, o: RetryOptions = {}): Promise<FetchOutcome> {
  const log: string[] = [];
  const say = (line: string) => { log.push(line); o.onLog?.(line); };
  const maxWait = o.maxWaitSec ?? MAX_RETRY_WAIT_SEC;
  const sleep = o.sleep ?? nap;

  let waitedSec = 0;
  let attempts = 1;
  let r = await once(url, init, o);

  if (r.status === "rate_limited" || r.status === "service_unavailable") {
    const code = r.res?.status ?? (r.status === "rate_limited" ? 429 : 503);
    const header = r.res?.headers.get("retry-after") ?? null;
    const asked = parseRetryAfter(header);
    const wait = Math.min(maxWait, Math.ceil(asked ?? o.defaultDelaySec ?? DEFAULT_RETRY_DELAY_SEC));
    say(asked !== null
      ? `${code} received → Retry-After: ${header!.trim()}${asked > maxWait ? ` (capped to ${maxWait}s)` : ""} → waiting ${wait}s → retrying once`
      : `${code} received → no Retry-After → applying configured retry delay (${wait}s) → retrying once`);
    await sleep(wait * 1000);
    waitedSec = wait;
    attempts = 2;
    r = await once(url, init, o);
    say(r.status === "success" ? `retry succeeded (HTTP ${r.res?.status}) → page processed normally` : `retry failed (${r.res ? `HTTP ${r.res.status}` : "no answer"}) → recorded as ${r.status}`);
  }

  if (r.status === "unauthorized" || r.status === "forbidden") say(`${r.res?.status} received → access denied → source marked Blocked`);
  else if (r.status === "captcha") say(`${r.res?.status ?? "?"} received → CAPTCHA / challenge page → not bypassed → source marked Blocked`);
  else if (r.status === "blocked") say(`${r.res?.status ?? "?"} received → explicit anti-bot access-denied page → not bypassed → source marked Blocked`);
  else if (r.status === "temporary_error" && !r.res) say("no answer from the site (network error or timeout) → temporary error");

  return { status: r.status, res: r.res, http: r.res?.status ?? null, attempts, waitedSec, log };
}

/** The line for a robots.txt refusal. */
export const robotsSkipLine = (url: string, rule?: string | null) => `robots.txt → URL disallowed${rule ? ` (${rule})` : ""} → request skipped: ${url}`;

/** A plain-language explanation of a status, for run messages. */
export function describeStatus(s: FetchStatus, http: number | null): string {
  switch (s) {
    case "rate_limited": return `rate_limited: the site answered HTTP ${http ?? 429} twice (after waiting once as it asked). This is temporary, not a block; it is tried again on the next run.`;
    case "service_unavailable": return `service_unavailable: the site answered HTTP ${http ?? 503} twice (after waiting once). This is temporary, not a block; it is tried again on the next run.`;
    case "temporary_error": return `temporary_error: ${http ? `HTTP ${http}` : "no answer from the site"}. It is tried again on the next run.`;
    case "unauthorized": return "unauthorized: the site answered HTTP 401 (login required).";
    case "forbidden": return "forbidden: the site answered HTTP 403 (access denied to automated requests).";
    case "captcha": return "captcha: the site shows a CAPTCHA / challenge page.";
    case "blocked": return "blocked: the site shows an explicit anti-bot access-denied page.";
    case "robots_disallowed": return "robots_disallowed: the site's robots.txt does not allow this address.";
    default: return "success";
  }
}
