import * as cheerio from "cheerio";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import type { ListingRecord } from "@/lib/import/csvImport";
import { moneyNumber } from "@/lib/import/richRaw";
import { UA, htmlToText } from "./webScan";
import { RobotsGate } from "./robotsGate";
import { isBlockedUrl } from "./blockedHosts";
import { fetchWithRetry } from "@/lib/fetch/httpStatus";
import { RenderingFetcher, isJsShell } from "./render";
import { isUsable, parseRenderedProperty, toListingRecord } from "./renderedParser";

/*
 * Deep scan of the listings a link source finds. The list page only shows a title and a price; the detail page and the
 * sale-notice PDF hold the real details (EMD, end date, application deadline, officer, address, lots …).
 *
 * For a listing that is NEW (or an existing one that is still thin) the scan:
 *   1. finds that listing's own page link inside the list page (same site only, robots.txt respected),
 *   2. reads the detail page and up to 2 notice PDFs (only text-based PDFs; a scanned image PDF is reported, not guessed),
 *   3. asks the Relay AI once, with the full text, for every detail; a notice that lists several properties comes back
 *      as several listings.
 * Everything is capped per run (listings, pages, characters), runs only inside the AI schedule and never touches a site
 * that refuses automated access (robots.txt, HTTP 401/403, the do-not-fetch list).
 */

export const DEEP_MAX_LISTINGS = 8; // deep scans per source per run
const DETAIL_CHARS = 14_000;
const PDF_CHARS = 12_000;
const MAX_PDFS = 4;
const MAX_DOC_LINKS = 14;
const MAX_HTML_BYTES = 2_500_000;
const MAX_PDF_BYTES = 4_000_000;
const PAUSE_MS = 400;

export interface PageLink {
  text: string;
  href: string;
}

export interface DeepResult {
  attempted: boolean; // false when the cap or time was reached: nothing was tried, try again next run
  records: ListingRecord[]; // the full listing(s); empty when nothing better was found
  note?: string;
  /** Why nothing was read (exact code): detail_page_empty, render_timeout, render_error, http_401, http_403, captcha, robots_disallowed, network_error, parser_failed … */
  reason?: string;
  /** The page was a JavaScript shell and was read after rendering it in a browser. */
  rendered?: boolean;
}

export interface DocFetch {
  kind: "html" | "pdf";
  html?: string;
  /** Rendered pages: the text as the browser lays it out (labels and values on their own lines). */
  text?: string;
  bytes?: Uint8Array;
  /** true: the HTML came from the browser renderer (the plain HTML was an empty JavaScript shell). */
  rendered?: boolean;
}

export interface DeepDeps {
  /**
   * Fetches a public page or document. null = refused / unavailable (the exact reason is in `failure`).
   * `via`: the list page that links to this address. A single-page app that shows nothing when its detail address is typed in is
   * opened the way a visitor does it: from that list page, by clicking the card.
   */
  fetchDoc: (url: string, opts?: { via?: string; noRender?: boolean }) => Promise<DocFetch | null>;
  pdfToText: (bytes: Uint8Array) => Promise<string>;
  ask: (system: string, user: string) => Promise<{ data: unknown; tokens: number }>;
  /** Exact reason code of the last failed fetchDoc per address. */
  failure?: Map<string, string>;
  /** Counters of the JavaScript render fallback. */
  renderStats?: { rendered: number; failed: number; lastError?: string };
  /** Releases the browser, if one was started. */
  close?: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------------
// Links of a list page
// ---------------------------------------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?|$)/i;
// A link that is a document even without a file extension (download.php?id=7, /uploads/..., /getfile/...)
const DOC_PATH = /(download|attachment|uploads?\/|getfile|viewfile|view-?document|document|\bdms\b|\bfile\b|notice|annexure)/i;
const DOC_TEXT = /(notice|pdf|download|view document|terms|conditions|bid form|application form|tender|annexure|proclamation|corrigendum|schedule|demand|possession|e-?auction|brochure|valuation|inspection)/i;
const SKIP_HREF = /^(#|javascript:|mailto:|tel:)/i;
const SKIP_PATH = /(login|register|signin|signup|logout|contact|about|privacy|terms|faq|blog|category|tag|feed|wp-json|cart|account)/i;

function resolve(href: string, base: string): string | null {
  try {
    if (SKIP_HREF.test(href.trim())) return null;
    const u = new URL(href, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const siteOf = (host: string) => host.toLowerCase().replace(/^www\./, "");
const sameSite = (a: string, b: string) => {
  try { return siteOf(new URL(a).hostname) === siteOf(new URL(b).hostname); } catch { return false; }
};

/**
 * The page link that belongs to one listing: find the smallest element holding the listing's title, then look in it and
 * in its closest containers for a link to another page of the same site (a "View details" button, a title link).
 */
export function detailLinkFor(html: string, title: string, pageUrl: string, otherTitles: string[] = []): { detail: string | null; docs: PageLink[] } {
  const $ = cheerio.load(html);
  const needle = norm(title).slice(0, 48);
  if (needle.length < 8) return { detail: null, docs: [] };
  let best: ReturnType<typeof $> | null = null;
  let bestLen = Infinity;
  $("h1,h2,h3,h4,h5,h6,a,p,li,td,span,div,strong,b").each((_, el) => {
    const text = norm($(el).text());
    if (text.includes(needle) && text.length < bestLen) {
      best = $(el);
      bestLen = text.length;
    }
  });
  if (!best) return { detail: null, docs: [] };

  // Another listing's title inside a container means we climbed from one card into the whole list: stop there.
  const others = otherTitles.map((t) => norm(t).slice(0, 40)).filter((t) => t.length >= 8 && !needle.startsWith(t.slice(0, 20)));
  let node: ReturnType<typeof $> = best;
  let foundDocs: PageLink[] = []; // notice PDFs of the card, kept even when the card has no page link of its own
  for (let depth = 0; depth < 4 && node.length; depth++, node = node.parent()) {
    if (depth > 0 && others.some((o) => norm(node.text()).includes(o))) break;
    const anchors = (node.is("a") ? node : node.find("a")).toArray().map((a) => ({ text: norm($(a).text()), href: resolve($(a).attr("href") ?? "", pageUrl) }));
    const docs = anchors.filter((a): a is { text: string; href: string } => !!a.href && DOC_EXT.test(a.href)).map((a) => ({ text: a.text, href: a.href }));
    if (docs.length && foundDocs.length === 0) foundDocs = docs;
    const pages = anchors.filter((a) => a.href && !DOC_EXT.test(a.href) && sameSite(a.href, pageUrl) && a.href !== pageUrl && !SKIP_PATH.test(new URL(a.href).pathname) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(a.href));
    // a container with several different page links is a list, not one listing: go no higher
    const distinct = new Set(pages.map((p) => p.href));
    if (distinct.size === 1) return { detail: pages[0].href!, docs: foundDocs.length ? foundDocs : docs };
    if (distinct.size > 1) {
      const titled = pages.find((p) => norm(p.text).includes(needle.slice(0, 20)));
      return { detail: titled?.href ?? null, docs: foundDocs.length ? foundDocs : docs };
    }
  }
  return { detail: null, docs: foundDocs };
}

/**
 * Every document a page links: PDFs / Word / Excel files, "Download" / "Sale notice" / "Terms" style links even without a file
 * extension, files that a page embeds (iframe / embed / object) and links marked `download`. Images are only taken when the
 * link text or address says it is a notice (a scanned notice), never logos or photos.
 */
export function noticeLinks(html: string, pageUrl: string): PageLink[] {
  const $ = cheerio.load(html);
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const add = (href: string | null, text: string) => {
    if (!href || seen.has(href) || out.length >= MAX_DOC_LINKS) return;
    if (!sameSite(href, pageUrl) && !DOC_EXT.test(href)) return;
    seen.add(href);
    out.push({ text: text.slice(0, 120), href });
  };
  $("a[href]").each((_, a) => {
    const href = resolve($(a).attr("href") ?? "", pageUrl);
    if (!href || href === pageUrl) return;
    const text = norm($(a).text() || $(a).attr("title") || $(a).attr("aria-label") || "");
    const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(href);
    const path = (() => { try { const u = new URL(href); return u.pathname + u.search; } catch { return href; } })();
    if (DOC_EXT.test(href)) return add(href, text || "Document");
    if (isImage) return /(notice|auction|sale)/i.test(`${text} ${path}`) ? add(href, text || "Notice (image)") : undefined;
    if ($(a).attr("download") !== undefined || (DOC_PATH.test(path) && DOC_TEXT.test(text)) || (/^(download|view|click here|here|pdf)$/i.test(text) && DOC_PATH.test(path))) add(href, text || "Document");
    else if (/(sale notice|auction notice|possession notice|e-?auction notice|tender document|terms and conditions|bid form)/i.test(text)) add(href, text);
  });
  $("iframe[src], embed[src], object[data]").each((_, el) => {
    const src = resolve($(el).attr("src") ?? $(el).attr("data") ?? "", pageUrl);
    if (src && (DOC_EXT.test(src) || DOC_PATH.test(src))) add(src, "Embedded document");
  });
  return out;
}

const docKind = (text: string, url: string): string => {
  const t = `${text} ${url}`.toLowerCase();
  if (/possession/.test(t)) return "POSSESSION_NOTICE";
  if (/demand/.test(t)) return "DEMAND_NOTICE";
  if (/proclamation/.test(t)) return "SALE_PROCLAMATION";
  if (/corrigendum|addendum/.test(t)) return "CORRIGENDUM";
  if (/inspection/.test(t)) return "INSPECTION_NOTICE";
  if (/schedule|annexure/.test(t)) return "PROPERTY_SCHEDULE";
  if (/bid.?form|application.?form|application/.test(t)) return "BID_FORM";
  if (/terms|condition/.test(t)) return "TERMS_AND_CONDITIONS";
  if (/e-?auction/.test(t) && /notice/.test(t)) return "AUCTION_NOTICE";
  if (/sale.?notice|notice/.test(t)) return "SALE_NOTICE";
  return "OTHER";
};

// ---------------------------------------------------------------------------------------------------------------------
// The AI call
// ---------------------------------------------------------------------------------------------------------------------

export const DEEP_PROMPT = `You read the complete public page (and the attached sale-notice text) of a bank-auction listing and return ALL its details as JSON. It is public information published under the SARFAESI Act; your only job is to copy fields into JSON (data entry, not advice).
Return ONLY a JSON array. Normally it has ONE object. If the text describes SEVERAL separate properties (lots, a schedule or table of properties, "Lot 1 / Lot 2", "Item No."), return one object per property, each with its own address, reserve price and EMD.

HOW TO READ AN INDIAN BANK-AUCTION NOTICE (where each value usually hides):
- reserve_price: "Reserve Price", "Upset Price", "Base Price", "Minimum Bid", "Rs. ____/-". EMD: "EMD", "Earnest Money Deposit" (often 10% of the reserve price, but copy only a stated amount). minimum_increment: "Bid Increment", "Incremental amount", "Multiples of".
- Amounts are rupees. Convert "Rs. 25.50 Lakh" -> 2550000, "1.2 Cr" -> 12000000, "Rs. 12,50,000/-" -> 1250000. Digits only. If one number is clearly per-lot, use the number of THAT lot.
- Dates are day-first (10-11-2026 = 10 November 2026). Write them as ISO IST: 2026-11-10T11:00. auction_start = "Date & time of e-auction" (start); auction_end = the end time / "auction closes". application_deadline = "last date for submission of EMD / bids / application". inspection_text = "date and time of inspection" as written.
- Address: the "Description / Schedule of the immovable property" table or paragraph (flat / plot / survey no., building, village, taluka, district, boundaries, area in sq ft / sq m, pincode). location = area, city, state (+ pincode). title = a short plain title such as "3 BHK flat in Andheri West, Mumbai" or "Residential plot in Una, Himachal Pradesh" built only from the text.
- Bank and branch: the secured creditor / authorised officer's branch. officer_name / officer_phone / officer_email: the "Authorised Officer" and contact details. borrower: "Borrower / Guarantor / Mortgagor" names.
- possession_status: Symbolic / Physical / Constructive. auction_method: E-Auction, Online, Tender-cum-auction. external_id / notice_number: the listing / auction / notice number shown.
- Encumbrances, known dues and "as is where is" terms: mention them in description in one or two sentences.
Keys (strings; leave a key out when the text does not say it; never guess, never calculate, never copy a value from a different lot):
title, bank, branch, category (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT or AGRICULTURAL),
location, address, description, borrower, reserve_price, emd, minimum_increment, auction_start, auction_end, application_deadline, inspection_text, auction_method, possession_status, officer_name, officer_phone, officer_email, notice_number, external_id.
Only real-estate listings (land, buildings, flats, houses, shops, offices, factories, plots, farms). NEVER vehicles, machinery, stock, gold or other movables: skip them.
If the text is only a general notice with no property details, return [].`;

type Raw = Record<string, unknown>;
const str = (v: unknown, max = 600): string => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * BAANKNET publishes the complete auction-property dataset inside Next.js Flight payloads on its public
 * listing/index pages. The normal property-detail URL is only a client-side shell, so prefer this first-party
 * embedded dataset when it is present. This reads the same public HTML response; no login/CAPTCHA bypass is used.
 */
export function extractBaanknetEmbeddedAuctions(html: string, pageUrl: string): ListingRecord[] {
  let host = "";
  try { host = siteOf(new URL(pageUrl).hostname); } catch { return []; }
  if (host !== "baanknet.com") return [];

  const sources: Raw[] = [];
  const flight = /self\.__next_f\.push\(\[1,(\"(?:\\.|[^\"\\])*\")\]\)/g;
  for (const m of html.matchAll(flight)) {
    try {
      const payload = JSON.parse(m[1]) as string;
      const colon = payload.indexOf(":");
      if (colon < 0) continue;
      const value = JSON.parse(payload.slice(colon + 1)) as unknown;
      const walk = (v: unknown) => {
        if (Array.isArray(v)) { for (const item of v) walk(item); return; }
        if (!v || typeof v !== "object") return;
        const o = v as Record<string, unknown>;
        const data = (o.auctionData as Record<string, unknown> | undefined)?.data;
        if (Array.isArray(data)) {
          for (const item of data) {
            if (!item || typeof item !== "object") continue;
            const row = item as Record<string, unknown>;
            const source = row._source;
            if (String(row._index ?? "") === "psba_auction_property" && source && typeof source === "object") sources.push(source as Raw);
          }
        }
        for (const child of Object.values(o)) walk(child);
      };
      walk(value);
    } catch { /* unrelated Next.js Flight payload */ }
  }

  const utcIst = (v: unknown): string => {
    const s = str(v, 40);
    if (!s) return "";
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s.replace(/Z$/, "");
    return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 19);
  };
  const money = (v: unknown) => {
    const n = moneyNumber(str(v, 50));
    return n || "";
  };
  const category = (type: string, sub: string) => {
    const s = type + " " + sub;
    if (/agricultur|farm/i.test(s)) return "AGRICULTURAL";
    if (/industri|factory|warehouse/i.test(s)) return "INDUSTRIAL";
    if (/commercial|shop|office|showroom/i.test(s)) return "COMMERCIAL";
    if (/plot|land/i.test(s)) return "LAND_PLOT";
    if (/residential|flat|house|villa|apartment|bungalow/i.test(s)) return "RESIDENTIAL";
    return "";
  };

  const seen = new Set<string>();
  const out: ListingRecord[] = [];
  for (const r of sources) {
    const auctionId = str(r.auctionId, 40);
    const propertyId = str(r.propertyDetailId, 40);
    const identity = auctionId || propertyId;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);

    const type = str(r.propertyType, 80);
    const sub = str(r.propertySubType, 100);
    const city = str(r.cityName, 100);
    const district = str(r.districtName, 100);
    const state = str(r.stateName, 100);
    const pincode = str(r.pincode, 20).replace(/\D/g, "").slice(0, 6);
    const place = [city, district && district !== city ? district : "", state, pincode].filter(Boolean).join(", ");
    const address = str(r.address, 900);
    const title = str(r.propertyHeading, 240) || (sub || type || "Property") + " for sale" + (city ? " in " + city : "");
    const sourceUrl = auctionId ? "https://baanknet.com/auction-detail/" + auctionId : "https://baanknet.com/property-detail/" + propertyId;

    const media: { type: string; title: string; url: string }[] = [];
    const propertyMedia = Array.isArray(r.propertyMedia) ? r.propertyMedia : [];
    for (const m of propertyMedia) {
      if (!m || typeof m !== "object") continue;
      const x = m as Record<string, unknown>;
      const rawUrl = str(x.url, 1000);
      const filepath = str(x.filepath, 800).replace(/^\/+/, "");
      const url = rawUrl || (filepath ? "https://cdn.baanknet.com/" + filepath : "");
      if (url) media.push({ type: "PHOTO", title: str(x.filename, 180) || "Property image", url });
    }
    const displayImage = str(r.displayImage, 1000);
    if (displayImage) {
      const url = /^https?:\/\//i.test(displayImage) ? displayImage : "https://cdn.baanknet.com/" + displayImage.replace(/^\/+/, "");
      if (!media.some((m) => m.url === url)) media.unshift({ type: "PHOTO", title: "Property image", url });
    }

    const docs: { type: string; title: string; url: string }[] = [];
    const auctionDocs = Array.isArray(r.auctionDocuments) ? r.auctionDocuments : [];
    for (const d of auctionDocs) {
      if (!d || typeof d !== "object") continue;
      const x = d as Record<string, unknown>;
      const filepath = str(x.filepath, 500).replace(/^\/+/, "");
      if (!filepath) continue;
      docs.push({
        type: /term|condition/i.test(str(x.description, 120)) ? "TERMS_AND_CONDITIONS" : "SALE_NOTICE",
        title: str(x.description, 120) || str(x.filename, 120) || "Auction document",
        url: "https://cdn.baanknet.com/" + filepath,
      });
    }

    const inspectionStart = utcIst(r.inspectionStart);
    const inspectionEnd = utcIst(r.inspectionEnd);
    const inspection = [inspectionStart, inspectionEnd].filter(Boolean).join(" to ");
    const desc = [
      type || sub ? type + (sub ? " - " + sub : "") + "." : "",
      r.propertyPossessionType ? "Possession: " + str(r.propertyPossessionType, 80) + "." : "",
      r.typeOfAction ? "Action: " + str(r.typeOfAction, 100) + "." : "",
      propertyId ? "Bank property ID: " + propertyId + "." : "",
      r.propertyUniqueId ? "Property unique ID: " + str(r.propertyUniqueId, 100) + "." : "",
      address,
    ].filter(Boolean).join(" ");

    out.push({
      title,
      bank: str(r.propertyBankName, 140),
      branch: str(r.propertyBranchName, 140) || str(r.auctionBranch, 140),
      category: category(type, sub),
      location: place || address.slice(0, 200),
      description: desc.slice(0, 1500),
      borrower: str(r.borrowerName, 200),
      reserve_price: money(r.reservePrice),
      emd: money(r.emd),
      minimum_increment: money(r.incrementPrice),
      auction_start: utcIst(r.auctionFrom),
      auction_end: utcIst(r.auctionTo),
      application_deadline: utcIst(r.emdEnd),
      inspection_text: inspection ? inspection + (r.inspectionName ? " (" + str(r.inspectionName, 120) + ")" : "") : "",
      auction_method: "E-Auction",
      possession_status: str(r.propertyPossessionType, 80),
      officer_name: str(r.checkerName, 120),
      officer_phone: str(r.roMobile, 80) || str(r.inspectionMobileNo, 80),
      officer_email: str(r.roEmail, 160),
      notice_number: auctionId,
      external_id: "src:baanknet.com:" + identity,
      legal_schedule: address,
      source_property_type: sub || type,
      source_url: sourceUrl,
      documents: JSON.stringify(docs),
      media: JSON.stringify(media),
      borrower_status: r.borrowerName ? "available" : "not_available_from_source",
      deep_done: "1",
    });
  }
  return out;
}


/** Maps what the AI returned onto the importer's listing keys. */
export function toListings(data: unknown, docs: { type: string; title: string; url: string }[], source: { sourceUrl: string }): ListingRecord[] {
  const arr = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const out: ListingRecord[] = [];
  for (const r of arr as Raw[]) {
    if (!r || typeof r !== "object") continue;
    const title = str(r.title, 200);
    if (!title) continue;
    const address = str(r.address, 700);
    out.push({
      title,
      bank: str(r.bank, 120),
      branch: str(r.branch, 120),
      category: str(r.category, 30).toUpperCase().replace(/[ &]+/g, "_"),
      location: str(r.location, 200) || address.slice(0, 200),
      description: str(r.description, 1500),
      borrower: str(r.borrower, 160),
      reserve_price: moneyNumber(str(r.reserve_price, 40)),
      emd: moneyNumber(str(r.emd, 40)),
      minimum_increment: moneyNumber(str(r.minimum_increment, 40)),
      auction_start: str(r.auction_start, 30),
      auction_end: str(r.auction_end, 30),
      application_deadline: str(r.application_deadline, 30),
      inspection_text: str(r.inspection_text, 300),
      auction_method: str(r.auction_method, 60),
      possession_status: str(r.possession_status, 60),
      officer_name: str(r.officer_name, 80),
      officer_phone: str(r.officer_phone, 60),
      officer_email: str(r.officer_email, 120),
      notice_number: str(r.notice_number, 80),
      external_id: str(r.external_id, 80),
      legal_schedule: address,
      source_url: source.sourceUrl,
      documents: JSON.stringify(docs),
      deep_done: "1",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The deepener used by the importer
// ---------------------------------------------------------------------------------------------------------------------

/** JavaScript rendering is on by default; set RENDER_JS_PAGES=0 to switch it off. */
const RENDER_ENABLED = process.env.RENDER_JS_PAGES !== "0";

export function realDeps(o: { onEvent?: (line: string) => void } = {}): DeepDeps {
  const gate = new RobotsGate(); // robots.txt is read once per site
  let nextSlot = 0; // requests start at least PAUSE_MS apart, even when several pages are being read side by side
  const failure = new Map<string, string>();
  const renderStats: { rendered: number; failed: number; lastError?: string } = { rendered: 0, failed: 0 };
  let renderer: RenderingFetcher | null = null;
  return {
    failure,
    renderStats,
    async close() {
      await renderer?.close();
      renderer = null;
    },
    async fetchDoc(url, fopts) {
      failure.delete(url);
      const fail = (code: string) => { failure.set(url, code); return null; };
      if (isBlockedUrl(url)) return fail("internal_policy_block");
      if (!/^https:/i.test(url)) return fail("not_https");
      if ((await gate.check(url)) !== "allowed") return fail("robots_disallowed");
      const gap = Math.max(PAUSE_MS, (await gate.delayFor(url)) * 1000); // the site's own Crawl-delay, when it states one
      const at = Math.max(Date.now(), nextSlot);
      nextSlot = at + gap;
      if (at > Date.now()) await sleep(at - Date.now());
      // 429 / 503: one polite retry (Retry-After, at most 20 s). 401 / 403 / CAPTCHA: refused, never retried or bypassed.
      const out = await fetchWithRetry(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf" }, signal: AbortSignal.timeout(25_000), redirect: "follow" }, { onLog: (l) => console.log(`[crawler] ${l} (${url})`), inspectBody: false });
      const res = out.res;
      if (!res || out.status !== "success") {
        return fail(!res ? "network_error" : out.status === "unauthorized" ? "http_401" : out.status === "forbidden" ? "http_403" : out.status === "captcha" ? "captcha" : out.status === "rate_limited" ? "http_429" : out.status === "service_unavailable" ? "http_503" : `http_${res.status}`);
      }
      if (!res.ok) return fail(`http_${res.status}`);
      if (!sameSite(res.url, url)) return fail("redirected_to_other_site");
      const type = res.headers.get("content-type") ?? "";
      if (/pdf/i.test(type) || DOC_EXT.test(url)) {
        const buf = new Uint8Array(await res.arrayBuffer());
        return buf.length > 0 && buf.length <= MAX_PDF_BYTES ? { kind: "pdf", bytes: buf } : fail("pdf_empty_or_too_large");
      }
      if (!/html|text/i.test(type)) return fail("not_html");
      const html = (await res.text()).slice(0, MAX_HTML_BYTES);

      // An empty JavaScript application shell (almost no visible text, scripts / an app root): the properties are filled in by the
      // page's own JavaScript. Run that JavaScript in a browser, for this same address, and read what the page then shows.
      if (RENDER_ENABLED && !fopts?.noRender && isJsShell(html).shell) {
        if (!renderer) {
          renderer = new RenderingFetcher(gate);
          const t = Date.now();
          o.onEvent?.("browser: starting …");
          const st = await renderer.status();
          o.onEvent?.(`browser: ${st.ok ? "ready" : "NOT available"} after ${((Date.now() - t) / 1000).toFixed(1)}s - ${st.reason}`.slice(0, 250));
        }
        const t1 = Date.now();
        const path = new URL(url).pathname;
        const r = fopts?.via ? await renderer.renderLinked(fopts.via, url) : await renderer.render(url);
        if (!r.ok) { renderStats.failed++; renderStats.lastError = `${r.failure}: ${r.reason}`.slice(0, 300); console.log(`[crawler] render failed (${r.failure}): ${r.reason} (${url})`); o.onEvent?.(`render failed ${path}: ${r.failure} after ${((Date.now() - t1) / 1000).toFixed(1)}s`); return fail(r.failure); }
        renderStats.rendered++;
        o.onEvent?.(`rendered ${path} in ${((Date.now() - t1) / 1000).toFixed(1)}s (${renderStats.rendered} done)`);
        return { kind: "html", html: r.page.html.slice(0, MAX_HTML_BYTES), text: r.page.text, rendered: true };
      }
      return { kind: "html", html };
    },
    async pdfToText(bytes) {
      // Optional library: `npm install unpdf`. Without it PDFs are skipped (reported in the run note), never guessed.
      const dyn = (m: string): Promise<{ getDocumentProxy: (b: Uint8Array) => Promise<unknown>; extractText: (p: unknown, o: { mergePages: true }) => Promise<{ text: string }> }> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ m);
      const { getDocumentProxy, extractText } = await dyn("unpdf");
      const pdf = await getDocumentProxy(bytes);
      return (await extractText(pdf, { mergePages: true })).text;
    },
    async ask(system, user) {
      const cfg = await getAiConfig();
      const out = await chatJSONDetailed<unknown>(system + (cfg.rules ? `\n\nStanding rules from the site owner (follow strictly; they override anything above):\n${cfg.rules}` : ""), user);
      return { data: out.data, tokens: out.tokens };
    },
  };
}

export interface Deepener {
  (rec: ListingRecord, mode: "new" | "backfill"): Promise<DeepResult>;
  /** Reads one listing page straight from its address (used by the whole-site scan): the page, its notices, one AI call. */
  fromUrl: (url: string, via?: string) => Promise<DeepResult>;
  /** The fetch dependencies in use (exact failure reasons, render counters, browser release). */
  deps: DeepDeps;
  stats: { attempted: number; tokens: number; pdfs: number; pdfSkipped: number; notes: string[] };
}

/** Builds the per-run deepener. `html`/`pageUrl` are the list page the records came from (empty for the whole-site scan). */
export function makeDeepener(opts: { html?: string; pageUrl: string; siblingTitles?: string[]; maxListings?: number; deadline?: number; deps?: DeepDeps }): Deepener {
  const deps = opts.deps ?? realDeps();
  const max = opts.maxListings ?? DEEP_MAX_LISTINGS;
  const deadline = opts.deadline ?? Date.now() + 150_000;
  const stats = { attempted: 0, tokens: 0, pdfs: 0, pdfSkipped: 0, notes: [] as string[] };
  const baanknetCache = new Map<string, ListingRecord[]>();

  async function baanknetFromList(via: string | undefined, detailUrl: string): Promise<ListingRecord | null> {
    if (!via) return null;
    try {
      if (siteOf(new URL(via).hostname) !== "baanknet.com") return null;
      let records = baanknetCache.get(via);
      if (!records) {
        const page = await deps.fetchDoc(via, { noRender: true });
        records = page?.kind === "html" && page.html ? extractBaanknetEmbeddedAuctions(page.html, via) : [];
        baanknetCache.set(via, records);
      }
      const id = new URL(detailUrl).pathname.match(/\/(?:auction|property)-detail\/(\d+)/i)?.[1] ?? ""; 
      return records.find((r) => r.external_id === "src:baanknet.com:" + id || r.source_url === detailUrl) ?? null;
    } catch { return null; }
  }

  /** The common work: the listing's page (if any), its notice PDFs, then one AI call for every detail. */
  async function readDetail(rec: ListingRecord, detail: string | null, docLinks: PageLink[], mode: string, via?: string): Promise<DeepResult> {
    const blocks: string[] = [];
    const docs: { type: string; title: string; url: string }[] = [];
    let detailUrl = detail;
    const pdfLinks: PageLink[] = [...docLinks];
    let renderedFlag = false;
    if (detailUrl) {
      const page = await deps.fetchDoc(detailUrl, via ? { via } : undefined);
      if (page?.kind === "html" && page.html) {
        if (page.rendered) {
          renderedFlag = true;
          // A page produced by the browser is read by code first (labels and values), with no AI call: it is exact and free.
          const parsed = parseRenderedProperty(page.html, detailUrl, page.text);
          if (isUsable(parsed)) {
            stats.notes.push("rendered page read by code (no AI)");
            return { attempted: true, records: [toListingRecord(parsed)], rendered: true, note: `${mode}: rendered page read by code (${parsed.missing.length ? `missing: ${parsed.missing.join(", ")}` : "all fields found"})` };
          }
        }
        blocks.push(`=== DETAIL PAGE (${detailUrl}) ===\n${(page.text ?? htmlToText(page.html)).slice(0, DETAIL_CHARS)}`);
        for (const n of noticeLinks(page.html, detailUrl)) if (!pdfLinks.some((p) => p.href === n.href)) pdfLinks.push(n);
      } else if (page?.kind === "pdf" && page.bytes) {
        pdfLinks.unshift({ text: "notice", href: detailUrl });
        detailUrl = null;
      }
    }
    let used = 0;
    for (const d of pdfLinks.slice(0, MAX_DOC_LINKS)) {
      docs.push({ type: docKind(d.text, d.href), title: d.text.slice(0, 100) || "Notice", url: d.href });
      if (used >= MAX_PDFS || /\.(docx?|xlsx?|jpe?g|png|gif|webp)(\?|$)/i.test(d.href)) continue; // Word / Excel / images are kept as links only
      const doc = await deps.fetchDoc(d.href);
      if (doc?.kind !== "pdf" || !doc.bytes) continue;
      try {
        const text = (await deps.pdfToText(doc.bytes)).replace(/\s+\n/g, "\n").trim();
        if (text.length < 80) { stats.pdfSkipped++; stats.notes.push("a PDF has no readable text (scanned image)"); continue; }
        blocks.push(`=== NOTICE DOCUMENT (${d.text || d.href}) ===\n${text.slice(0, PDF_CHARS)}`);
        stats.pdfs++;
        used++;
      } catch (e) {
        stats.pdfSkipped++;
        stats.notes.push(/unpdf|Cannot find|Failed to resolve/i.test(String(e)) ? "PDF reader not installed (npm install unpdf)" : "a PDF could not be read");
      }
    }
    if (blocks.length === 0) {
      const code = (detailUrl && deps.failure?.get(detailUrl)) || "detail_page_empty";
      return { attempted: true, records: [], note: `no detail page or readable notice found (${code})`, reason: code };
    }

    const seen = rec.title ? `LISTING SEEN ON THE LIST PAGE:\n${JSON.stringify({ title: rec.title, bank: rec.bank, location: rec.location, reserve_price: rec.reserve_price, auction_start: rec.auction_start })}\n\n` : "";
    try {
      const out = await deps.ask(DEEP_PROMPT, `${seen}${blocks.join("\n\n")}`);
      stats.tokens += out.tokens;
      const records = toListings(out.data, docs, { sourceUrl: detailUrl ?? pdfLinks[0]?.href ?? opts.pageUrl });
      // the list page's own values fill anything the detail text did not state
      for (const r of records) {
        if (!r.bank && rec.bank) r.bank = String(rec.bank);
        if (records.length === 1) {
          if (!r.reserve_price && rec.reserve_price) r.reserve_price = String(rec.reserve_price);
          if (!r.auction_start && rec.auction_start) r.auction_start = String(rec.auction_start);
          if (!r.location && rec.location) r.location = String(rec.location);
          if (!r.category && rec.category) r.category = String(rec.category);
        }
      }
      return { attempted: true, records, rendered: renderedFlag, ...(records.length === 0 ? { reason: "parser_failed" } : {}), note: `${mode}: ${records.length} listing(s) from ${blocks.length} text block(s)` };
    } catch (e) {
      return { attempted: true, records: [], reason: "parser_failed", note: e instanceof Error ? e.message : String(e) };
    }
  }

  const run = (async (rec: ListingRecord, mode: "new" | "backfill"): Promise<DeepResult> => {
    if (stats.attempted >= max || Date.now() > deadline) return { attempted: false, records: [] };
    stats.attempted++;
    if (siteOf(new URL(opts.pageUrl).hostname) === "baanknet.com" && opts.html) {
      const embedded = extractBaanknetEmbeddedAuctions(opts.html, opts.pageUrl);
      const hit = embedded.find((r) => r.title === rec.title || (rec.external_id && r.external_id === rec.external_id));
      if (hit) return { attempted: true, records: [hit], note: mode + ": BAANKNET embedded auction data read from listing HTML" };
    }
    const link = detailLinkFor(opts.html ?? "", String(rec.title ?? "").trim(), opts.pageUrl, opts.siblingTitles ?? []);
    return readDetail(rec, link.detail, link.docs, mode, opts.pageUrl); // opened from its list page, like a visitor
  }) as Deepener;
  run.fromUrl = async (url: string, via?: string): Promise<DeepResult> => {
    if (stats.attempted >= max || Date.now() > deadline) return { attempted: false, records: [] };
    stats.attempted++;
    const embedded = await baanknetFromList(via, url);
    if (embedded) return { attempted: true, records: [embedded], note: "page: BAANKNET embedded auction data read from listing HTML" };
    return readDetail({}, url, [], "page", via);
  };
  run.deps = deps;
  run.stats = stats;
  return run;
}