import * as cheerio from "cheerio";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import type { ListingRecord } from "@/lib/import/csvImport";
import { moneyNumber } from "@/lib/import/richRaw";
import { UA, htmlToText } from "./webScan";
import { RobotsGate } from "./robotsGate";
import { isBlockedUrl } from "./blockedHosts";

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
}

export interface DeepDeps {
  /** Fetches a public page or document. null = refused / unavailable. */
  fetchDoc: (url: string) => Promise<{ kind: "html" | "pdf"; html?: string; bytes?: Uint8Array } | null>;
  pdfToText: (bytes: Uint8Array) => Promise<string>;
  ask: (system: string, user: string) => Promise<{ data: unknown; tokens: number }>;
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

export function realDeps(): DeepDeps {
  const gate = new RobotsGate(); // robots.txt is read once per site
  let nextSlot = 0; // requests start at least PAUSE_MS apart, even when several pages are being read side by side
  return {
    async fetchDoc(url) {
      if (isBlockedUrl(url) || !/^https:/i.test(url)) return null;
      if ((await gate.check(url)) !== "allowed") return null;
      const gap = Math.max(PAUSE_MS, (await gate.delayFor(url)) * 1000); // the site's own Crawl-delay, when it states one
      const at = Math.max(Date.now(), nextSlot);
      nextSlot = at + gap;
      if (at > Date.now()) await sleep(at - Date.now());
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf" }, signal: AbortSignal.timeout(25_000), redirect: "follow" });
        // 429 / 503 = "too many requests, wait" (not a refusal): wait as long as the site asks (at most 20 s) and try once more.
        if (res.status === 429 || res.status === 503) {
          const wait = Math.min(20, Number(res.headers.get("retry-after")) || 8);
          await sleep(wait * 1000);
          res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf" }, signal: AbortSignal.timeout(25_000), redirect: "follow" });
        }
      } catch {
        return null;
      }
      if (!res.ok || !sameSite(res.url, url)) return null; // refused (401/403/…), or sent to another site
      const type = res.headers.get("content-type") ?? "";
      if (/pdf/i.test(type) || DOC_EXT.test(url)) {
        const buf = new Uint8Array(await res.arrayBuffer());
        return buf.length > 0 && buf.length <= MAX_PDF_BYTES ? { kind: "pdf", bytes: buf } : null;
      }
      if (!/html|text/i.test(type)) return null;
      return { kind: "html", html: (await res.text()).slice(0, MAX_HTML_BYTES) };
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
  fromUrl: (url: string) => Promise<DeepResult>;
  stats: { attempted: number; tokens: number; pdfs: number; pdfSkipped: number; notes: string[] };
}

/** Builds the per-run deepener. `html`/`pageUrl` are the list page the records came from (empty for the whole-site scan). */
export function makeDeepener(opts: { html?: string; pageUrl: string; siblingTitles?: string[]; maxListings?: number; deadline?: number; deps?: DeepDeps }): Deepener {
  const deps = opts.deps ?? realDeps();
  const max = opts.maxListings ?? DEEP_MAX_LISTINGS;
  const deadline = opts.deadline ?? Date.now() + 150_000;
  const stats = { attempted: 0, tokens: 0, pdfs: 0, pdfSkipped: 0, notes: [] as string[] };

  /** The common work: the listing's page (if any), its notice PDFs, then one AI call for every detail. */
  async function readDetail(rec: ListingRecord, detail: string | null, docLinks: PageLink[], mode: string): Promise<DeepResult> {
    const blocks: string[] = [];
    const docs: { type: string; title: string; url: string }[] = [];
    let detailUrl = detail;
    const pdfLinks: PageLink[] = [...docLinks];
    if (detailUrl) {
      const page = await deps.fetchDoc(detailUrl);
      if (page?.kind === "html" && page.html) {
        blocks.push(`=== DETAIL PAGE (${detailUrl}) ===\n${htmlToText(page.html).slice(0, DETAIL_CHARS)}`);
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
    if (blocks.length === 0) return { attempted: true, records: [], note: "no detail page or readable notice found" };

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
      return { attempted: true, records, note: `${mode}: ${records.length} listing(s) from ${blocks.length} text block(s)` };
    } catch (e) {
      return { attempted: true, records: [], note: e instanceof Error ? e.message : String(e) };
    }
  }

  const run = (async (rec: ListingRecord, mode: "new" | "backfill"): Promise<DeepResult> => {
    if (stats.attempted >= max || Date.now() > deadline) return { attempted: false, records: [] };
    stats.attempted++;
    const link = detailLinkFor(opts.html ?? "", String(rec.title ?? "").trim(), opts.pageUrl, opts.siblingTitles ?? []);
    return readDetail(rec, link.detail, link.docs, mode);
  }) as Deepener;
  run.fromUrl = async (url: string): Promise<DeepResult> => {
    if (stats.attempted >= max || Date.now() > deadline) return { attempted: false, records: [] };
    stats.attempted++;
    return readDetail({}, url, [], "page");
  };
  run.stats = stats;
  return run;
}