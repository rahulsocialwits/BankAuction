import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UA } from "@/data-sources/feeds/webScan";
import type { Candidate, DocRef, ImageRef } from "./types";

/*
 * AI Python Scrap — DEMO: a small, polite, bounded crawler.
 *  - same domain only (www. and the bare domain count as one site)
 *  - robots.txt is read once per site and checked before EVERY request
 *  - a request budget and a time limit; one request at a time with a short pause
 *  - 401/403, 429, anti-bot challenges and login walls are REFUSED: no retry, no workaround
 */

export class Refused extends Error {}
export class Failed extends Error {}

const MAX_BYTES = 1_500_000;
const PAUSE_MS = 350;

export const siteOf = (host: string) => host.replace(/^www\./i, "").toLowerCase();

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

/** The demo only ever fetches public internet pages. */
export async function assertPublicHost(host: string) {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Failed("Only public websites can be used in the demo.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Failed("The website address could not be found.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Failed("Only public websites can be used in the demo.");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|br|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8377;|&rupee;/g, "₹")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------------
// robots.txt (read once per site, cached for the run)
// ---------------------------------------------------------------------------------------------------------------------

type Group = { agents: string[]; disallow: string[]; allow: string[] };
type RobotsEntry = { kind: "rules"; groups: Group[] } | { kind: "disallowed" } | { kind: "unreachable" };

function parseRobots(body: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.disallow.push(val);
    if (key === "allow" && val) cur.allow.push(val);
  }
  return groups;
}

function pathAllowed(groups: Group[], path: string): boolean {
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && "bankauctionbot".includes(a)));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  let bestLen = -1;
  let allowed = true;
  for (const g of applicable) {
    for (const p of g.disallow) if (path.startsWith(p) && p.length > bestLen) { bestLen = p.length; allowed = false; }
    for (const p of g.allow) if (path.startsWith(p) && p.length >= bestLen) { bestLen = p.length; allowed = true; }
  }
  return allowed;
}

// ---------------------------------------------------------------------------------------------------------------------
// Crawler
// ---------------------------------------------------------------------------------------------------------------------

const CHALLENGE = /(just a moment|attention required|cf-chl|cf-browser-verification|captcha|are you a human|verify you are human|access denied|request blocked|enable javascript and cookies)/i;

export interface Fetched {
  url: string; // final address (after same-site redirects)
  status: number;
  contentType: string;
  html: string;
  ms: number;
  redirects: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Crawler {
  requests = 0;
  readonly host: string;
  private robots = new Map<string, RobotsEntry>();
  private sitemapsByOrigin = new Map<string, string[]>();
  private checkedHosts = new Set<string>();
  private nextSlot = 0;

  constructor(
    startUrl: string,
    readonly maxRequests: number,
    readonly deadline: number,
  ) {
    this.host = siteOf(new URL(startUrl).hostname);
  }

  /** Same site as the start page (www. and the bare domain count as one). Pages are only ever fetched from here. */
  sameSite(url: string): boolean {
    try { return siteOf(new URL(url).hostname) === this.host; } catch { return false; }
  }

  /** The site or one of its sub-domains. Used for the data requests a rendered page makes, never for crawling pages. */
  sameFamily(url: string): boolean {
    try { const h = siteOf(new URL(url).hostname); return h === this.host || h.endsWith("." + this.host); } catch { return false; }
  }

  timeLeft(): number { return this.deadline - Date.now(); }

  /** Requests are spaced out even when several run side by side. */
  private async slot() {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + PAUSE_MS;
    if (at > now) await sleep(at - now);
  }

  /** Counts one request against the budget and the time limit. The browser renderer uses this too. */
  consume() {
    if (this.requests >= this.maxRequests) throw new Failed(`request budget reached (${this.maxRequests})`);
    if (Date.now() > this.deadline) throw new Failed("time limit reached");
    this.requests++;
  }

  /** "allowed" | "disallowed" | "unreachable" for this exact address. Reads robots.txt once per site. */
  async robotsFor(url: string): Promise<"allowed" | "disallowed" | "unreachable"> {
    const u = new URL(url);
    let entry = this.robots.get(u.origin);
    if (!entry) {
      if (!this.checkedHosts.has(u.hostname)) { await assertPublicHost(u.hostname); this.checkedHosts.add(u.hostname); }
      try {
        const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
        if (res.status === 401 || res.status === 403) entry = { kind: "disallowed" };
        else if (res.status >= 400 && res.status < 500) entry = { kind: "rules", groups: [] };
        else if (!res.ok) entry = { kind: "unreachable" };
        else {
          const body = await res.text();
          entry = { kind: "rules", groups: parseRobots(body) };
          this.sitemapsByOrigin.set(u.origin, [...body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 8));
        }
      } catch {
        entry = { kind: "unreachable" };
      }
      this.robots.set(u.origin, entry);
    }
    if (entry.kind === "disallowed") return "disallowed";
    if (entry.kind === "unreachable") return "unreachable";
    return pathAllowed(entry.groups, u.pathname + u.search) ? "allowed" : "disallowed";
  }

  /** Sitemap addresses the site itself declares in robots.txt (after robotsFor ran for that site). */
  declaredSitemaps(origin: string): string[] {
    return this.sitemapsByOrigin.get(origin) ?? [];
  }

  /** One page, with every protection check. Follows up to 3 redirects, only within the same site. */
  async page(startUrl: string): Promise<Fetched> {
    let url = startUrl;
    const t0 = Date.now();
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(url);
      if (u.protocol !== "https:") throw new Failed("only https addresses are used in the demo");
      if (!this.sameSite(url)) throw new Failed(`outside the site (${u.hostname}); the demo stays on one domain`);
      const verdict = await this.robotsFor(url);
      if (verdict === "disallowed") throw new Refused(`robots.txt: ${u.hostname} does not allow our crawler on ${u.pathname || "/"} (or robots.txt itself answers 401/403). The page was not requested.`);
      if (verdict === "unreachable") throw new Failed(`${u.hostname}/robots.txt request got no reply from the site (15 s). Some sites silently ignore automated requests; that is the site's own choice and the demo never works around it. No page request was made. Try again later, or use pasted text, a PDF or an authorised feed.`);

      this.consume();
      await this.slot();
      let res: Response;
      try {
        res = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,text/plain" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        throw new Failed(timeout ? `timeout: ${u.hostname} did not answer within 20 seconds` : `network error while contacting ${u.hostname}`);
      }
      const status = res.status;
      const server = (res.headers.get("server") ?? "").toLowerCase();
      const challenged = res.headers.get("cf-mitigated") === "challenge";
      if (status === 401 || status === 403 || challenged) {
        throw new Refused(challenged || server.includes("cloudflare") ? `protected access: HTTP ${status} with an anti-bot challenge` : `HTTP ${status}: the site refuses automated requests`);
      }
      if (status === 429) throw new Refused("HTTP 429: the site is rate-limiting automated requests");
      if (status >= 300 && status < 400) {
        const loc = res.headers.get("location") ?? "";
        if (/login|signin|sign-in|auth|account/i.test(loc)) throw new Refused(`protected access: redirects to a login (${loc.slice(0, 100)})`);
        if (!loc) throw new Failed(`HTTP ${status} without a destination`);
        url = new URL(loc, url).toString().split("#")[0];
        continue;
      }
      if (!res.ok) throw new Failed(`HTTP ${status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!/text\/(html|plain)|xhtml/i.test(contentType)) throw new Failed(`content type "${contentType || "unknown"}" is not a web page`);
      const html = (await res.text()).slice(0, MAX_BYTES);
      if (CHALLENGE.test(htmlToText(html).slice(0, 3000)) && html.length < 8000) throw new Refused(`protected access: HTTP ${status} but the page is a challenge or access-denied screen`);
      return { url, status, contentType, html, ms: Date.now() - t0, redirects: hop };
    }
    throw new Failed("too many redirects");
  }

  /** A sitemap (XML) from this site: robots-checked, one request, no gzip. Returns null if it is not available. */
  async xml(url: string): Promise<string | null> {
    try {
      if (!this.sameSite(url) || /\.gz(\?|$)/i.test(url)) return null;
      if ((await this.robotsFor(url)) !== "allowed") return null;
      this.consume();
      await this.slot();
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      if (!res.ok || !this.sameSite(res.url)) return null;
      return (await res.text()).slice(0, 2_000_000);
    } catch {
      return null;
    }
  }

  /** Only asks a document's own server for its type and size (HEAD). Same site only; robots checked. */
  async head(url: string): Promise<{ check: DocRef["check"]; mime: string | null; sizeBytes: number | null; date: string | null }> {
    try {
      if (!this.sameSite(url)) return { check: "listed only", mime: null, sizeBytes: null, date: null };
      if ((await this.robotsFor(url)) !== "allowed") return { check: "REFUSED", mime: null, sizeBytes: null, date: null };
      this.consume();
      await this.slot();
      const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
      if (res.status === 401 || res.status === 403 || res.status === 429) return { check: "REFUSED", mime: null, sizeBytes: null, date: null };
      if (!res.ok) return { check: "unreachable", mime: null, sizeBytes: null, date: null };
      const len = Number(res.headers.get("content-length"));
      return { check: "reachable", mime: res.headers.get("content-type")?.split(";")[0] ?? null, sizeBytes: Number.isFinite(len) && len > 0 ? len : null, date: res.headers.get("last-modified") };
    } catch {
      return { check: "unreachable", mime: null, sizeBytes: null, date: null };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a page: links, images, documents, map position, structured data
// ---------------------------------------------------------------------------------------------------------------------

export interface RawLink { url: string; text: string }

const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const abs = (href: string, base: string): string | null => {
  try {
    const u = new URL(href.trim().replace(/&amp;/g, "&"), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
};

export function extractLinks(html: string, base: string): RawLink[] {
  const out: RawLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const url = abs(m[1] ?? m[2] ?? "", base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: clean(m[3]).slice(0, 200) || (attr(m[0], "title") ?? attr(m[0], "aria-label") ?? "").slice(0, 200) });
  }
  // documents a page shows inside itself (iframe / embed / object) are documents too
  const emb = /<(?:iframe|embed|object)[^>]*?(?:src|data)\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  for (let m = emb.exec(html); m; m = emb.exec(html)) {
    const url = abs(m[1] ?? m[2] ?? "", base);
    if (!url || seen.has(url) || !(DOC_EXT.test(url) || /(download|attachment|uploads?\/|getfile|viewfile|document|notice)/i.test(url))) continue;
    seen.add(url);
    out.push({ url, text: "Embedded document" });
  }
  return out;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1, 3).find((x) => x !== undefined) ?? null;
const SKIP_IMG = /(logo|favicon|sprite|spacer|pixel|blank|loader|spinner|avatar|icon|\.svg(\?|$)|\.gif(\?|$)|facebook|twitter|whatsapp)/i;

export function extractImages(html: string, base: string, sourcePage: string): ImageRef[] {
  const out: ImageRef[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null, alt: string | null, title: string | null, kind: string) => {
    if (!raw) return;
    const url = abs(raw.split(/\s+/)[0], base);
    if (!url || seen.has(url) || SKIP_IMG.test(url)) return;
    seen.add(url);
    out.push({ url, sourcePage, alt: alt || null, title: title || null, kind });
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const prop = attr(m[0], "property") ?? attr(m[0], "name");
    if (prop && /^(og:image|twitter:image)$/i.test(prop)) add(attr(m[0], "content"), null, null, prop.toLowerCase());
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = attr(tag, "srcset");
    const src = attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-original") ?? attr(tag, "data-lazy-src") ?? (srcset ? srcset.split(",")[0] : null);
    add(src, attr(tag, "alt"), attr(tag, "title"), "img");
  }
  return out.slice(0, 40);
}

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv)(\?|$)/i;
const DOC_WORDS = /(sale notice|auction notice|possession notice|e-?auction|terms|conditions|brochure|\bnit\b|tender|document|attachment|notice|annexure|bid form|inspection)/i;

export function docType(text: string, url: string): string {
  const t = `${text} ${url}`.toLowerCase();
  if (/possession/.test(t)) return "Possession Notice";
  if (/sale notice|sale-notice|salenotice/.test(t)) return "Sale Notice";
  if (/auction notice|e-?auction|auction-notice/.test(t)) return "Auction Notice";
  if (/terms|condition/.test(t)) return "Terms & Conditions";
  if (/brochure/.test(t)) return "Brochure";
  if (/\bnit\b|tender/.test(t)) return "NIT / Tender";
  if (/inspection/.test(t)) return "Inspection document";
  if (/bid form|annexure|application/.test(t)) return "Bid / Application form";
  if (/notice/.test(t)) return "Notice";
  return "Attachment";
}

export function extractDocuments(links: RawLink[], sourcePage: string): DocRef[] {
  const out: DocRef[] = [];
  for (const l of links) {
    const isFile = DOC_EXT.test(new URL(l.url).pathname + new URL(l.url).search);
    const pathy = /(download|attachment|uploads?\/|getfile|viewfile|view-?document|dms)/i.test(new URL(l.url).pathname + new URL(l.url).search);
    // a document link: a file, a "Download / Sale notice / Terms" link, or a download-style address (even with an icon-only or generic text)
    if (!isFile && !(DOC_WORDS.test(l.text) && /(download|view|pdf|notice|document|terms)/i.test(`${l.text} ${l.url}`) && l.text.length < 120) && !(pathy && l.text.length < 120)) continue;
    if (!isFile && /(login|register|contact|about)/i.test(l.url)) continue;
    const ext = l.url.match(DOC_EXT)?.[1]?.toLowerCase() ?? null;
    const mimeByExt: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", csv: "text/csv" };
    out.push({
      title: l.text || decodeURIComponent(new URL(l.url).pathname.split("/").pop() ?? "Document"),
      url: l.url,
      type: docType(l.text, l.url),
      mime: ext ? mimeByExt[ext] ?? null : null,
      sizeBytes: null,
      date: null,
      sourcePage,
      check: "listed only",
    });
  }
  return out.slice(0, 20);
}

export function extractMap(html: string, links: RawLink[]): { mapUrl: string | null; lat: number | null; lng: number | null } {
  const mapLink = links.find((l) => /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|openstreetmap\.org|maps\.apple\.com)/i.test(l.url));
  const hay = `${mapLink?.url ?? ""} ${html}`;
  const m =
    hay.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/) ??
    hay.match(/[?&](?:q|ll|query)=(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/) ??
    hay.match(/data-lat(?:itude)?\s*=\s*["'](-?\d{1,2}\.\d+)["'][^>]*data-l(?:ng|on|ongitude)\s*=\s*["'](-?\d{1,3}\.\d+)["']/i) ??
    hay.match(/"latitude"\s*:\s*"?(-?\d{1,2}\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d{1,3}\.\d+)"?/i) ??
    hay.match(/name=["']geo\.position["'][^>]*content=["'](-?\d{1,2}\.\d+)[;,]\s*(-?\d{1,3}\.\d+)["']/i);
  return { mapUrl: mapLink?.url ?? null, lat: m ? Number(m[1]) : null, lng: m ? Number(m[2]) : null };
}

export function extractJsonLd(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = m[1].trim();
    if (t) out.push(t.slice(0, 8000));
    if (out.length >= 5) break;
  }
  return out;
}

export const pageTitle = (html: string): string | null => {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return clean(h1 ?? t ?? "").slice(0, 200) || null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Which links look like a single property, and which look like a list of properties
// ---------------------------------------------------------------------------------------------------------------------

const PROP_WORDS = /\b(flat|plot|land|house|shop|office|factory|godown|warehouse|residential|commercial|industrial|agricultural|bungalow|apartment|villa|building|property|premises|unit|showroom)\b/i;
const NEGATIVE = /(login|signin|sign-in|register|signup|sign-up|contact|about|privacy|terms|faq|blog|career|sitemap|cart|account|logout|help|news|press|policy|disclaimer|how-it-works|feedback|subscribe|javascript:|mailto:|tel:)/i;
const NAV_WORDS = /^(home|about( us)?|contact( us)?|login|register|faq|blog|help|privacy policy|terms( & conditions)?|next|previous|prev|more|all|search|menu)$/i;
const LISTING_PATH = /(properties|property-list|propertylist|listing|listings|search|auctions|e-auction|eauction|bank-auction|all-properties|browse|find|residential|commercial|industrial|agricultural|lands?|plots?|flats?)/i;

export function detailScore(l: RawLink): number {
  const u = new URL(l.url);
  const path = u.pathname.toLowerCase();
  if (DOC_EXT.test(path) || /\.(jpe?g|png|gif|svg|css|js|ico|webp)$/i.test(path)) return -10;
  if (NEGATIVE.test(path) || NAV_WORDS.test(l.text.trim())) return -5;
  const last = path.split("/").filter(Boolean).pop() ?? "";
  let s = 0;
  if (/(property|properties|auction|listing|asset|lot|view|detail|sale|notice)/.test(path)) s += 2;
  if (/\d{3,}/.test(last) || /[?&](id|pid|propertyid|property_id|auction_id|lot)=\w+/i.test(u.search)) s += 3;
  if (last.split("-").length >= 4) s += 2;
  if (/(view details|details|bid now|e-?auction)/i.test(l.text)) s += 1;
  if (/(₹|rs\.?\s?\d|reserve|lakh|crore)/i.test(l.text)) s += 2;
  if (PROP_WORDS.test(l.text)) s += 2;
  if (l.text.length > 25) s += 1;
  return s;
}

export function isDetailCandidate(l: RawLink): boolean {
  const u = new URL(l.url);
  const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
  const idLike = /\d{3,}/.test(last) || /[?&](id|pid|propertyid|property_id|auction_id|lot)=\w+/i.test(u.search) || last.split("-").length >= 4;
  return detailScore(l) >= 4 && (idLike || PROP_WORDS.test(l.text));
}

export function listingScore(l: RawLink): number {
  const u = new URL(l.url);
  const path = u.pathname.toLowerCase();
  if (DOC_EXT.test(path) || NEGATIVE.test(path)) return -5;
  let s = 0;
  if (LISTING_PATH.test(path)) s += 2;
  if (/(properties|listing|search|auctions|e-auction|browse|view all|all properties|find)/i.test(l.text)) s += 2;
  if (path.split("/").filter(Boolean).length <= 2) s += 1;
  return s;
}

export function toCandidates(links: RawLink[]): Candidate[] {
  return links.filter(isDetailCandidate).map((l) => ({ url: l.url, text: l.text, score: detailScore(l) })).sort((a, b) => b.score - a.score);
}

export function looksLikeProperty(text: string): boolean {
  if (text.length < 400) return false;
  const signals = [/reserve price|reserve\s*₹|base price/i, /\bemd\b|earnest/i, /e-?auction|auction date|bid/i, /possession|sarfaesi|secured creditor/i, /₹|rs\.?\s?\d/i, PROP_WORDS, /address|situated|located|village|taluka|pincode|pin code/i];
  return signals.filter((r) => r.test(text)).length >= 3;
}

export const RELATED_WORDS = /(notice|terms|conditions|inspection|bidding|how to bid|documents|brochure|schedule|branch|auction details|property details)/i;
const RELATED_NEGATIVE = /(login|signin|sign-in|register|signup|logout|cart|account|blog|career|sitemap|privacy|faq|javascript:|mailto:|tel:)/i;

export function relatedLinks(links: RawLink[], selectedUrl: string, docs: DocRef[]): RawLink[] {
  const docUrls = new Set(docs.map((d) => d.url));
  return links
    .filter((l) => l.url !== selectedUrl && !docUrls.has(l.url) && !DOC_EXT.test(l.url) && !RELATED_NEGATIVE.test(new URL(l.url).pathname) && RELATED_WORDS.test(`${l.text} ${new URL(l.url).pathname}`) && !isDetailCandidate(l))
    .slice(0, 3);
}
