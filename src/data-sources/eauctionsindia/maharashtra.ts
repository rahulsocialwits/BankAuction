import * as cheerio from "cheerio";
import { EAUCTIONS_HOST, parseEauctionsPage } from "./parse";

/*
 * Pure helpers for the Maharashtra-only eAuctionsIndia run (scripts/eauctions-maharashtra-import.ts).
 *
 * The Maharashtra listing address is NOT known: the only real page in the repository is /category/residential, and the site answers
 * automated requests (even robots.txt) with a Cloudflare challenge, so no Maharashtra page could be inspected. The address is therefore
 * given by the person who sees it in their own browser (--url=...), never guessed here. Paging follows the page's own rel="next" link
 * and nothing else: the /<n> pattern of the residential category is NOT assumed for any other address.
 */

/** Only an https address on eauctionsindia.com, under /category/ or /search..., with no credentials. Returns the cleaned URL or an error text. */

export function checkStartUrl(
  raw: string | undefined
): { ok: true; url: string } | { ok: false; reason: string } {
  if (!raw?.trim()) {
    return {
      ok: false,
      reason: "Pass the actual Maharashtra listing URL using --url.",
    };
  }

  let u: URL;

  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "The address is not a valid URL." };
  }

  if (u.protocol !== "https:") {
    return { ok: false, reason: "The address must use https://." };
  }

  if (u.username || u.password) {
    return { ok: false, reason: "Credentials are not allowed in the URL." };
  }

  if (u.hostname.replace(/^www\./i, "").toLowerCase() !== EAUCTIONS_HOST) {
    return { ok: false, reason: `Only ${EAUCTIONS_HOST} addresses are allowed.` };
  }

  const path = u.pathname.replace(/\/+$/, "") || "/";

  const allowed =
    path === "/properties-in-maharashtra" ||
    /^\/category\/[a-z0-9-]+(?:\/\d+)?$/i.test(path) ||
    /^\/search(?:\/.*)?$/i.test(path);

  if (!allowed) {
    return {
      ok: false,
      reason: "Only a public Maharashtra listing, category listing, or search page is allowed.",
    };
  }

  u.hash = "";
  return { ok: true, url: u.toString() };
}


/**
 * Does the page itself say it is a Maharashtra list? True when the heading or the page title names Maharashtra. A page that does not
 * say so is not imported as Maharashtra: the list pages carry no state field, so the address alone is not evidence.
 */
export function pageSaysMaharashtra(html: string): boolean {
  const $ = cheerio.load(html);
  const head = `${$("h1").first().text()} ${$("title").first().text()}`;
  return /maharashtra/i.test(head);
}

/** The next page to read: the page's own rel="next" link, same site, never the current page, never one already read. */
export function nextPageUrl(nextUrl: string | null, current: string, visited: Set<string>): string | null {
  if (!nextUrl) return null;
  let n: URL;
  try { n = new URL(nextUrl, current); } catch { return null; }
  if (n.hostname.replace(/^www\./, "") !== EAUCTIONS_HOST || n.protocol !== "https:") return null;
  n.hash = "";
  const s = n.toString();
  return s === current || visited.has(s) ? null : s;
}

/** A sample is always capped: at most 50 records and 3 pages, whatever is asked. */
export const SAMPLE_MAX_RECORDS = 50;
export const SAMPLE_MAX_PAGES = 3;
export const clampSample = (n: number | undefined) => Math.max(1, Math.min(SAMPLE_MAX_RECORDS, Number.isFinite(n) ? (n as number) : 20));

/**
 * A page saved from the browser's "view-source:" view (Ctrl+S on view-source) is the page's HTML wrapped in a table, one <td class="line-content">
 * per source line. Returns the original HTML; any other HTML is returned unchanged.
 */
export function unwrapViewSource(html: string): string {
  if (!html.includes('class="line-content"')) return html;
  const $ = cheerio.load(html);
  return $("td.line-content").map((_, e) => $(e).text()).get().join("\n");
}

export interface LocalPageReport {
  cards: number;
  rejected: number;
  saysMaharashtra: boolean;
  headline: string;
  headlineTotal: number | null;
  lastPage: number | null;
  nextUrl: string | null;
  samples: Array<{ id: string; type: string; place: string; reserve_price: string; auction_start: string; bank: string; url: string }>;
}

/** Read-only look at ONE saved page: no network, no database, no permission needed, nothing imported. Not evidence of coverage. */
export function inspectLocalPage(rawHtml: string, sample = 5): LocalPageReport {
  const html = unwrapViewSource(rawHtml);
  const page = parseEauctionsPage(html, "");
  const headline = cheerio.load(html)("h1").first().text().replace(/\s+/g, " ").trim();
  return {
    cards: page.records.length,
    rejected: page.rejected,
    saysMaharashtra: pageSaysMaharashtra(html),
    headline,
    headlineTotal: page.headlineTotal,
    lastPage: page.lastPage,
    nextUrl: page.nextUrl,
    samples: page.records.slice(0, Math.max(0, sample)).map((r) => ({
      id: String(r.external_id), type: String(r.source_property_type ?? ""), place: String(r.location ?? ""),
      reserve_price: String(r.reserve_price ?? ""), auction_start: String(r.auction_start ?? ""), bank: String(r.bank ?? ""), url: String(r.source_url ?? ""),
    })),
  };
}
