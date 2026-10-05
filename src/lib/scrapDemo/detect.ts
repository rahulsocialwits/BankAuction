import { htmlToText, extractLinks, isDetailCandidate, listingScore, type RawLink } from "./crawl";
import type { PageKind, PageState } from "./types";

export type { PageState };

/*
 * AI Python Scrap — DEMO: page diagnostics, "is this a property page?" scoring, and link classification.
 * A page is never rejected for one missing field: it collects evidence (14 signals + structured data + URL pattern)
 * and a plain-HTML page that is only an application shell is reported as JS_SHELL (needs rendering), not as "not a property".
 */

export interface PageStats {
  htmlChars: number;
  text: string;
  textChars: number;
  title: string | null;
  h1: string | null;
  h2Count: number;
  scripts: number;
  links: number;
  images: number;
  jsonLdCount: number;
  keywords: { property: number; auction: number; bank: number; reserve: number; emd: number; date: number; address: number };
  shellMarkers: string[];
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function pageStats(html: string): PageStats {
  const text = htmlToText(html);
  const markers: string[] = [];
  if (/<app-root\b/i.test(html)) markers.push("<app-root> (Angular)");
  if (/ng-version=/i.test(html)) markers.push("ng-version");
  if (/<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i.test(html)) markers.push("empty #root (React)");
  if (/<div[^>]+id=["']__next["']/i.test(html)) markers.push("#__next (Next.js)");
  if (/<div[^>]+id=["']app["'][^>]*>\s*<\/div>/i.test(html)) markers.push("empty #app (Vue)");
  if (/__NUXT__|__INITIAL_STATE__|__APOLLO_STATE__/.test(html)) markers.push("embedded app state");
  if (/<noscript[^>]*>[\s\S]{0,300}(enable|turn on)[\s\S]{0,40}javascript/i.test(html)) markers.push("<noscript> asks for JavaScript");
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    htmlChars: html.length,
    text,
    textChars: text.length,
    title: title ? strip(title).slice(0, 200) || null : null,
    h1: h1 ? strip(h1).slice(0, 200) || null : null,
    h2Count: count(html, /<h2\b/gi),
    scripts: count(html, /<script\b/gi),
    links: count(html, /<a\b[^>]*href=/gi),
    images: count(html, /<img\b/gi),
    jsonLdCount: count(html, /type\s*=\s*["']application\/ld\+json["']/gi),
    keywords: {
      property: count(text, /\b(property|flat|plot|land|house|shop|office|factory|building|apartment|villa|premises|godown|warehouse)\b/gi),
      auction: count(text, /\b(auction|e-?auction|bid|bidder|bidding)\b/gi),
      bank: count(text, /\b(bank|finance|hfc|secured creditor)\b/gi),
      reserve: count(text, /(reserve|base|upset)\s*price/gi),
      emd: count(text, /\bemd\b|earnest money/gi),
      date: count(text, /\b\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3,9})[-/. ]\d{2,4}\b/g),
      address: count(text, /\b(address|village|taluka|tehsil|district|pin\s*code|pincode|situated|survey no)\b/gi),
    },
    shellMarkers: markers,
  };
}

/** A page whose HTML holds the application but not (yet) the content. Rendering it in a browser is the next step. */
export function isJsShell(s: PageStats): { shell: boolean; why: string } {
  const k = s.keywords;
  const evidence = k.reserve + k.emd + k.address + k.bank;
  if (s.textChars < 500 && (s.scripts >= 3 || s.shellMarkers.length > 0)) return { shell: true, why: `only ${s.textChars} characters of visible text with ${s.scripts} script(s)${s.shellMarkers.length ? ` and ${s.shellMarkers.join(", ")}` : ""}` };
  if (s.textChars < 1500 && s.scripts >= 8 && evidence === 0) return { shell: true, why: `${s.textChars} characters of visible text, ${s.scripts} scripts and no property wording: the content is probably loaded by JavaScript` };
  return { shell: false, why: "" };
}

export interface Detection {
  score: number;
  label: "NOT PROPERTY" | "POSSIBLE" | "STRONG" | "CONFIRMED";
  signals: string[]; // signals found
  signalsTotal: number;
  reasons: string[];
  detected: { title: string | null; propertyId: string | null; auctionId: string | null; reserve: string | null; emd: string | null; auctionDate: string | null };
  listingLike: boolean;
}

export const labelFor = (score: number): Detection["label"] => (score <= 20 ? "NOT PROPERTY" : score <= 50 ? "POSSIBLE" : score <= 80 ? "STRONG" : "CONFIRMED");

const MONEY = "(?:₹|rs\\.?|inr)?\\s*([\\d,]{4,}(?:\\.\\d+)?)";
const GENERIC_TITLE = /^(home|baanknet|bank auction|auctions?|properties|search|welcome)\b/i;

export function scoreProperty(s: PageStats, html: string, url: string): Detection {
  const t = s.text;
  const signals: string[] = [];
  const reasons: string[] = [];
  let score = 0;
  const add = (name: string, points: number, why: string) => {
    score += points;
    signals.push(name);
    reasons.push(`+${points} ${name}: ${why}`);
  };

  const propertyId = t.match(/\b(?:property|prop)\.?\s*(?:id|no|number|code|ref(?:erence)?)\b\.?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i)?.[1] ?? null;
  const auctionId = t.match(/\bauction\.?\s*(?:id|no|number|code)\b\.?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i)?.[1] ?? null;
  const reserveM = t.match(new RegExp(`(?:reserve|base|upset)\\s*price[^\\d₹]{0,40}${MONEY}`, "i"));
  const emdM = t.match(new RegExp(`(?:\\bemd\\b|earnest money)[^\\d₹]{0,40}${MONEY}`, "i"));
  const dateM = t.match(/(?:auction|bid(?:ding)?|e-?auction)[^\n]{0,30}(?:date|time|start|end|on|from)[^\d]{0,15}(\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3,9})[-/. ]\d{2,4})/i);

  if (propertyId) add("Property ID", 8, `"${propertyId}"`);
  if (auctionId) add("Auction ID", 8, `"${auctionId}"`);
  if (s.keywords.bank > 0 && /(bank name|name of (the )?bank|bank:|state bank|canara|punjab national|bank of|union bank|hdfc|icici|axis|idbi|kotak|indian bank|central bank|uco|yes bank|federal bank|cooperative|financial|housing finance)/i.test(t)) add("Bank", 8, "a bank or lender is named");
  const heading = s.h1 ?? s.title;
  if (heading && heading.length >= 12 && !GENERIC_TITLE.test(heading) && (/\b(flat|plot|land|house|shop|office|factory|building|apartment|villa|property|residential|commercial|industrial|agricultural)\b/i.test(heading) || /\d/.test(heading))) add("Property title", 6, `heading "${heading.slice(0, 60)}"`);
  if (s.keywords.address > 0 && (/\b[1-9]\d{5}\b/.test(t) || /\baddress\b/i.test(t))) add("Property address", 8, "address wording with a location or pincode");
  if (reserveM) add("Reserve price", 12, `"${reserveM[1]}"`);
  else if (s.keywords.reserve > 0) add("Reserve price", 7, "label present, amount not read");
  if (emdM) add("EMD", 8, `"${emdM[1]}"`);
  else if (s.keywords.emd > 0) add("EMD", 5, "label present, amount not read");
  if (dateM) add("Auction date", 8, `"${dateM[1]}"`);
  else if (/(auction|bid)\s*(date|start|end|time)/i.test(t)) add("Auction date", 4, "label present, date not read");
  if (/inspection/i.test(t)) add("Inspection date", 4, "inspection wording");
  if (/(residential|commercial|industrial|agricultural|flat|plot|land|shop|office|house|bungalow|villa|factory|godown|warehouse)/i.test(`${heading ?? ""} ${t.slice(0, 2500)}`)) add("Property type", 6, "a property type is named");
  if (/\b\d[\d,.]*\s*(sq\.?\s*(ft|feet|mtr?s?|meters?|yards?)|sqft|sq\.?\s*m\b|acres?|guntha|bigha|hectare|cents?)\b/i.test(t)) add("Area", 6, "an area with a unit");
  if (/(sale notice|auction notice|possession notice|public notice|e-?auction notice)/i.test(t)) add("Sale notice", 4, "notice wording");
  if (/(auction details?|property details?|bid details?|auction summary)/i.test(t)) add("Auction detail", 4, "auction/property detail heading");
  if (t.length > 300 && s.keywords.property > 2) add("Property description", 10, `${t.length.toLocaleString("en-IN")} characters of text with property wording`);
  else if (t.length > 150 && s.keywords.property > 0) add("Property description", 5, "short description text");

  if (s.jsonLdCount > 0 && /"@type"\s*:\s*"?(RealEstateListing|Product|Offer|Residence|Place|House|Apartment|SingleFamilyResidence|LandmarksOrHistoricalBuildings)/i.test(html)) { score += 8; reasons.push("+8 structured data (JSON-LD) describes a listing/product"); }
  if (/\/(auction-detail|property-detail|property|auction|listing|asset)s?\/[\w-]*\d{3,}/i.test(url)) { score += 5; reasons.push("+5 URL pattern /…-detail/<id>"); }

  // A list of many properties is not one property.
  const prices = count(t, /(?:₹|rs\.?|inr)\s*[\d,]{5,}/gi);
  const listingLike = prices >= 8 && s.links >= 20 && !propertyId && !auctionId;
  if (listingLike) { score -= 25; reasons.push(`-25 looks like a list (${prices} prices, ${s.links} links)`); }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    label: labelFor(score),
    signals,
    signalsTotal: 14,
    reasons,
    detected: {
      title: heading ?? null,
      propertyId,
      auctionId,
      reserve: reserveM ? reserveM[1] : null,
      emd: emdM ? emdM[1] : null,
      auctionDate: dateM ? dateM[1] : null,
    },
    listingLike,
  };
}

export function pageState(s: PageStats, d: Detection, shell: boolean): PageState {
  if (d.score >= 51) return "PROPERTY_PAGE";
  if (shell) return "JS_SHELL";
  if (s.textChars >= 500) return "STATIC_CONTENT";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------------------------------------------------
// Link classification and pagination
// ---------------------------------------------------------------------------------------------------------------------

const PAGE_PARAM = /([?&](?:page|pg|p|pageno|pagenum|page_no|start|offset)=\d+)|(\/page\/\d+)|(\/p\/\d+)/i;

export function isPaginationLink(l: RawLink): boolean {
  return PAGE_PARAM.test(l.url) || /^(next|older|›|»|>|>>|next page|load more)$/i.test(l.text.trim()) || /\bpage\s*\d+\b/i.test(l.text);
}

/** What a not-yet-fetched link probably is (URL pattern and anchor text only; a fetched page is re-classified from its content). */
export function guessKind(l: RawLink): PageKind {
  const u = new URL(l.url);
  const path = u.pathname.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv)$/i.test(path)) return "DOCUMENT";
  if (/\.(jpe?g|png|gif|webp|svg|ico)$/i.test(path)) return "IMAGE";
  if (path === "/" || path === "") return "HOME";
  if (/\/auction-detail\b|\/auctions?\/[\w-]*\d{3,}|\/e-?auction\/[\w-]*\d{3,}/.test(path)) return "AUCTION";
  if (/\/property-detail\b|\/propert(y|ies)\/[\w-]*\d{3,}|\/listing\/[\w-]*\d{3,}|\/asset\/[\w-]*\d{3,}/.test(path) || isDetailCandidate(l)) return "PROPERTY";
  if (isPaginationLink(l)) return "PAGINATION";
  if (/(notice|nit\b|tender|terms|conditions)/.test(path) || /(sale notice|auction notice)/i.test(l.text)) return "NOTICE";
  if (/(search|find|filter|advanced)/.test(path)) return "SEARCH";
  if (/\/(state|states|city|cities|location|locations|district|region|area)s?(\/|$)/.test(path)) return "LOCATION";
  if (listingScore(l) >= 2) return "LISTING";
  if (path.split("/").filter(Boolean).length <= 1) return "NAVIGATION";
  return "OTHER";
}

/** Fetched page: its own content decides. */
export function classifyPage(guess: PageKind, d: Detection, s: PageStats, depth: number): PageKind {
  if (depth === 0) return d.score >= 51 ? "PROPERTY" : "HOME";
  if (d.score >= 51 && !d.listingLike) return /auction/i.test(guess) ? "AUCTION" : "PROPERTY";
  if (d.listingLike || (guess === "LISTING" && s.links >= 10)) return "LISTING";
  return guess === "PROPERTY" || guess === "AUCTION" ? (d.score >= 21 ? guess : "OTHER") : guess;
}

export function linksOf(html: string, base: string): RawLink[] {
  return extractLinks(html, base);
}

/** Next/previous-page links of a listing page. */
export function findPagination(links: RawLink[], currentUrl: string): RawLink[] {
  const cur = new URL(currentUrl);
  return links.filter((l) => {
    if (!isPaginationLink(l)) return false;
    const u = new URL(l.url);
    return u.origin === cur.origin && (u.pathname === cur.pathname || /page|p=|pg=/i.test(l.url));
  });
}

/** The id inside /property-detail/<id> or /auction-detail/<id>, to recognise the same property's own pages. */
export function idFromUrl(url: string): string | null {
  return new URL(url).pathname.match(/(?:property|auction|listing|asset)[\w-]*\/([\w-]*\d{3,}[\w-]*)/i)?.[1] ?? null;
}
