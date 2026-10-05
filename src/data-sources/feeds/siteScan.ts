import * as cheerio from "cheerio";
import { prisma } from "@/lib/db/prisma";
import { importRecords, type ImportResult } from "@/lib/import/csvImport";
import { htmlToText } from "./webScan";
import { extractBaanknetEmbeddedAuctions, makeDeepener, realDeps, type DeepDeps } from "./deepScan";

/*
 * Whole-website scan for listings (no AI for discovery, AI only to read each NEW listing page in full).
 *
 *   start page → index pages (cities, categories, pagination; capped per kind of page) → addresses of listing pages
 *   → the ones not seen before (newest first) → page + notice PDFs → one AI call each → import (duplicates are skipped).
 *
 * It stays on the site, respects robots.txt (read once, Crawl-delay honoured), skips the do-not-fetch list, never logs in.
 * Which addresses look like listing pages is learned from the site itself: many addresses with the same "shape"
 * (for example /auction/<bank>/<name>-<id>) that read like a property when sampled.
 */

const BLOCK_SEG = /^(blog|blogs|faq|news|jobs?|careers?|about|about-us|contact|contact-us|pricing|premium|login|register|signup|privacy|terms|search|cart|account|help|press|sitemap|tag|tags|category|author|feed|wp-[\w-]*|cars?|vehicles?|bikes?)$/i;
const TRACK = /^(utm_|fbclid$|gclid$|ref$|source$)/i;
const FILE = /\.(pdf|docx?|xlsx?|zip|jpe?g|png|gif|webp|svg|css|js|ico|xml|json)(\?|$)/i;
const MAX_PER_INDEX_SHAPE = 12;
const PROPERTY_WORDS = /(reserve|base|upset)\s*price/i; // a listing states its reserve price ...
const AUCTION_WORDS = /(emd|earnest|auction date|date of auction|auction on|e-?auction)/i; // ... and its auction terms (a bank's marketing page does not)
const MONEY = /(₹|rs\.?\s?\d|\d{1,3}(,\d{2}){1,2},\d{3})/i;

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

const siteOf = (host: string) => host.toLowerCase().replace(/^www\./, "");
const sameSite = (a: string, b: string) => {
  try { return siteOf(new URL(a).hostname) === siteOf(new URL(b).hostname); } catch { return false; }
};

type Kind = "slugid" | "slug" | "num" | "word" | "qid";
const kindOf = (seg: string): Kind => (/\d{4,}/.test(seg) ? "slugid" : seg.split("-").length >= 4 ? "slug" : /^\d+$/.test(seg) ? "num" : "word");

/** The "shape" of an address: first path part, depth and what the last part looks like. Cities share a shape, listings share another. */
export function shapeOf(url: string): string {
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean);
  if (/(^|&)(id|pid|propertyid|property_id|listing_id|auction_id|lot)=\d+/i.test(u.search)) return `${segs[0] ?? ""}|q|qid`;
  if (!segs.length) return "/";
  return `${segs[0]}|${segs.length}|${kindOf(segs[segs.length - 1])}`;
}

const isDetailShape = (shape: string) => /\|(slugid|slug|qid)$/.test(shape) && !BLOCK_SEG.test(shape.split("|")[0]);

/** The numeric id at the end of a listing address: higher is newer on almost every site. */
const idOf = (url: string): number => {
  const m = new URL(url).pathname.match(/(\d{4,})\/?$/) ?? new URL(url).search.match(/=(\d{4,})/);
  return m ? Number(m[1]) : 0;
};

export interface SiteDiscovery {
  details: string[]; // listing pages, newest first
  via: Record<string, string>; // listing page -> the index page that links to it
  pagesRead: number;
  shapes: { shape: string; count: number; verified: boolean; sample: string }[];
  notes: string[];
  baanknetNextPage?: number;
  baanknetTotalPages?: number;
}

export async function discoverListingUrls(
  start: string,
  deps: Pick<DeepDeps, "fetchDoc" | "failure">,
  opts: { maxPages?: number; maxDetails?: number; deadline?: number; scoped?: boolean; trusted?: string[]; verifyBudgetMs?: number } = {},
): Promise<SiteDiscovery> {
  // Started from a page inside a section (/auction-property/view-auction-property.aspx)? Stay in that section first.
  const startSeg = new URL(start).pathname.split("/").filter(Boolean)[0] ?? "";
  if (startSeg && opts.scoped !== false) {
    const inScope = await discoverCore(start, deps, opts, startSeg);
    if (inScope.details.length > 0) return inScope;
    const wide = await discoverCore(start, deps, opts, "");
    wide.notes.push(`nothing that looks like a listing inside "/${startSeg}", so the whole site was searched`);
    return wide;
  }
  return discoverCore(start, deps, opts, "");
}

async function discoverCore(
  start: string,
  deps: Pick<DeepDeps, "fetchDoc" | "failure">,
  opts: { maxPages?: number; maxDetails?: number; deadline?: number; trusted?: string[]; verifyBudgetMs?: number; baanknetStartPage?: number },
  scope: string,
): Promise<SiteDiscovery> {
  const maxPages = opts.maxPages ?? 30;
  const maxDetails = opts.maxDetails ?? 500;
  const deadline = opts.deadline ?? Date.now() + 120_000;
  const origin = normalizeUrl(start, start)!;
  const startUrl = (() => { const u = new URL(origin); const n = opts.baanknetStartPage ?? 1; if (siteOf(u.hostname) === "baanknet.com" && n > 1) u.searchParams.set("page", String(n)); return normalizeUrl(u.toString(), origin)!; })();
  const queue: string[] = [startUrl];
  const visited = new Set<string>();
  const queued = new Set<string>([origin]);
  const perShape = new Map<string, number>();
  const directDetails = new Set<string>();
  const byShape = new Map<string, Set<string>>();
  const via = new Map<string, string>(); // listing address -> the index page that links to it (a single-page app is opened from there)
  const notes: string[] = [];
  let pages = 0;
  let baanknetLastPage = 0;
  let baanknetTotalPages = 0;

  while (queue.length && pages < maxPages && Date.now() < deadline) {
    const url = queue.shift()!;
    visited.add(url);
    const shape = shapeOf(url);
    const isBaanknet = siteOf(new URL(url).hostname) === "baanknet.com";
    const isBaanknetPagination = isBaanknet && /[?&]page=\d+/i.test(url);
    if (url !== origin && !isBaanknetPagination) {
      const n = perShape.get(shape) ?? 0;
      if (n >= MAX_PER_INDEX_SHAPE) continue;
      perShape.set(shape, n + 1);
    }
    // Index pages are read as plain HTML only (rendering one costs 30+ seconds on a small server); the property links the plain HTML
    // carries are enough to start, and the browser is kept for the pages that hold the real property data.
    const page = await deps.fetchDoc(url, { noRender: true });
    if (!page || page.kind !== "html" || !page.html) { if (url === origin) notes.push("the start page could not be read (refused by robots.txt or the site)"); continue; }
    pages++;
    const $ = cheerio.load(page.html);
    const here = shapeOf(url);

    // BAANKNET publishes the real auction records (including image URLs) in the Next.js Flight payload.
    // Follow its numbered listing pages directly instead of opening every React detail route.
    if (siteOf(new URL(url).hostname) === "baanknet.com") {
      for (const rec of extractBaanknetEmbeddedAuctions(page.html, url)) {
        if (rec.source_url) {
          directDetails.add(rec.source_url);
          if (!via.has(rec.source_url)) via.set(rec.source_url, url);
        }
      }
      // Next.js Flight payloads can contain escaped quotes; normalize those before reading pagination metadata.
      const metaHtml = page.html.replace(/\\\"/g, '"');
      const pageNumber = (name: string) => Number((metaHtml.match(new RegExp('"' + name + '"\\s*:\\s*(\\d+)')) ?? [])[1] ?? "1");
      const current = pageNumber("currentPage");
      const total = pageNumber("totalPages");
      if (current > baanknetLastPage) baanknetLastPage = current;
      if (total > baanknetTotalPages) baanknetTotalPages = total;
      if (current >= 1 && total > current) {
        const next = current + 1;
        const nu = new URL(url);
        nu.searchParams.set("page", String(next));
        const nextUrl = normalizeUrl(nu.toString(), url);
        if (nextUrl && !visited.has(nextUrl) && !queued.has(nextUrl) && pages < maxPages) {
          queued.add(nextUrl);
          queue.unshift(nextUrl);
        }
      }
    }
    $("a[href]").each((_, a) => {
      const href = normalizeUrl($(a).attr("href") ?? "", url);
      if (!href || FILE.test(href) || !sameSite(href, origin)) return;
      if (scope && new URL(href).pathname.split("/").filter(Boolean)[0] !== scope) return; // outside the section we were asked to scan
      const s = shapeOf(href);
      (byShape.get(s) ?? byShape.set(s, new Set()).get(s)!).add(href);
      if (!via.has(href)) via.set(href, url);
      if (isDetailShape(s) || visited.has(href) || queued.has(href)) return;
      if (BLOCK_SEG.test(s.split("|")[0]) || s === "/") return;
      const depth = new URL(href).pathname.split("/").filter(Boolean).length;
      const paged = /[?&]page=\d+|\/page\/\d+|\/\d+$/.test(href); // "…/mumbai/all/all/2" is the next page of a list, however deep
      if (depth > (paged ? 7 : 4)) return;
      queued.add(href);
      // next pages of the list being read go first; other index pages (cities, categories) follow
      if (s === here || /[?&]page=\d+|\/page\/\d+|\/\d+$/.test(href)) queue.unshift(href);
      else queue.push(href);
    });
  }

  // Which shapes are listing pages? Many addresses of that shape, and a sampled page really reads like a property.
  const candidates = [...byShape.entries()].filter(([s, set]) => isDetailShape(s) && set.size >= 3).sort((a, b) => b[1].size - a[1].size).slice(0, 4);
  const shapes: SiteDiscovery["shapes"] = [];
  const details: string[] = [];
  // Verifying a group means reading one sample page (for a JavaScript site: rendering it in a browser, seconds each). A group that was
  // verified on an earlier scan is trusted without any request, and the rest has its own time allowance: a scan must never spend
  // minutes here and then be cut off before it saves anything.
  const verifyUntil = Date.now() + (opts.verifyBudgetMs ?? 100_000);
  for (const [s, set] of candidates) {
    const urls = [...set];
    let verified = !!opts.trusted?.includes(s);
    let assumed = false;
    if (!verified && Date.now() > verifyUntil) { notes.push(`group ${s} was not checked: the time allowance for checking groups was used up`); shapes.push({ shape: s, count: set.size, verified: false, sample: urls[0] }); continue; }
    for (const sample of verified ? [] : urls.slice(0, 2)) {
      const page = await deps.fetchDoc(sample, { via: via.get(sample) });
      // A sample that could not be rendered in time says nothing about the group: it is accepted for reading (each page is still
      // checked when it is read, and a non-property page is rejected with its reason) but NOT remembered as verified.
      if (!page && /^render_/.test(deps.failure?.get(sample) ?? "")) {
        assumed = true;
        notes.push(`group ${s}: the sample page could not be rendered in time (${deps.failure?.get(sample)}), accepted without verification`);
        break;
      }
      if (page?.kind === "html" && page.html) {
        const text = page.text ?? htmlToText(page.html);
        if (PROPERTY_WORDS.test(text) && AUCTION_WORDS.test(text) && MONEY.test(text)) { verified = true; break; }
      }
      if (Date.now() > verifyUntil) break;
    }
    shapes.push({ shape: s, count: set.size, verified, sample: urls[0] });
    if (verified || assumed) details.push(...urls);
  }
  if (!details.length) notes.push("no group of addresses looked like property pages (the site may load its listings with JavaScript)");
  const allDetails = [...new Set([...details, ...directDetails])];
  const sorted = allDetails.sort((a, b) => idOf(b) - idOf(a)).slice(0, maxDetails);
  return { details: sorted, via: Object.fromEntries(sorted.map((u) => [u, via.get(u) ?? origin])), pagesRead: pages, shapes, notes, baanknetNextPage: baanknetLastPage > 0 && baanknetTotalPages > baanknetLastPage ? baanknetLastPage + 1 : undefined, baanknetTotalPages: baanknetTotalPages || undefined };
}

export interface SiteScanResult {
  discovered: number; // listing pages found
  unseen: number; // of those, not read before
  read: number; // read in full this run
  import: ImportResult;
  tokens: number;
  pdfs: number;
  pending: boolean; // more unseen pages are waiting for the next run
  seen: string[]; // addresses to remember
  notes: string[];
  shapes: SiteDiscovery["shapes"];
  /** Groups of addresses that were verified as property pages (remembered, so the next scan does not check them again). */
  verifiedShapes: string[];
  /** Every listing that was NOT imported, with the exact reason(s) (never just a count). */
  rejections: { url: string; title?: string; reasons: string[] }[];
  rendered: number; // pages read after running their JavaScript in a browser
  baanknetNextPage?: number;
  baanknetTotalPages?: number;
}

/** Finds the listing pages of a site, reads the NEW ones in full and imports them. `dryRun` stops after discovery. */
export async function scanSiteForNew(opts: {
  startUrl: string;
  feedName: string;
  seen: Iterable<string>;
  maxNew?: number;
  maxIndexPages?: number;
  deadline?: number;
  dryRun?: boolean;
  deps?: DeepDeps;
  /** Groups verified on an earlier scan (see verifiedShapes). */
  trustedShapes?: string[];
  /** How many listing pages are read side by side (the AI is the slow part). */
  concurrency?: number;
  onProgress?: (line: string) => void;
  baanknetStartPage?: number;
}): Promise<SiteScanResult> {
  const say = opts.onProgress ?? (() => undefined);
  const deps = opts.deps ?? realDeps({ onEvent: opts.onProgress });
  const deadline = opts.deadline ?? Date.now() + 150_000;
  const seen = new Set(opts.seen);
  const maxNew = opts.maxNew ?? 10;

  say(`Scanning ${opts.startUrl} …`);
  const disc = await discoverListingUrls(opts.startUrl, deps, { maxPages: opts.maxIndexPages ?? 30, maxDetails: /baanknet\\.com$/i.test(new URL(opts.startUrl).hostname) ? 10000 : 500, deadline: Math.min(deadline, Date.now() + 90_000), trusted: opts.trustedShapes, baanknetStartPage: opts.baanknetStartPage });
  say(`  ${disc.pagesRead} index page(s) read, ${disc.details.length} listing page(s) found${disc.shapes.length ? ` (${disc.shapes.map((s) => `${s.shape}: ${s.count}${s.verified ? "" : " ✗"}`).join(", ")})` : ""}`);
  // A browser that cannot start (or a page it could not render) is stated in the run message, not hidden behind "0 listing pages".
  if (deps.renderStats?.failed) disc.notes.push(`the JavaScript render fallback failed ${deps.renderStats.failed} time(s) — ${deps.renderStats.lastError ?? "unknown reason"}`);
  for (const n of disc.notes) say(`  note: ${n}`);

  // Already imported earlier (by this scan or an older one): their address is stored on the auction.
  const unseen = disc.details.filter((u) => !seen.has(u));
  const known = new Set<string>();
  for (let i = 0; i < unseen.length; i += 400) {
    const rows = await prisma.auction.findMany({ where: { sourceUrl: { in: unseen.slice(i, i + 400) } }, select: { sourceUrl: true } });
    for (const r of rows) if (r.sourceUrl) known.add(r.sourceUrl);
  }
  const fresh = unseen.filter((u) => !known.has(u));
  for (const u of known) seen.add(u);
  say(`  ${fresh.length} new listing page(s) (${unseen.length - fresh.length} already on the site)`);

  const isBaanknet = /baanknet\\.com$/i.test(new URL(opts.startUrl).hostname);
  const out: SiteScanResult = { discovered: disc.details.length, unseen: fresh.length, read: 0, import: { created: 0, skipped: 0, failed: 0, updated: 0 }, tokens: 0, pdfs: 0, pending: fresh.length > maxNew || !!disc.baanknetNextPage, seen: [], notes: disc.notes, shapes: disc.shapes, verifiedShapes: disc.shapes.filter((x) => x.verified).map((x) => x.shape), rejections: [], rendered: 0, baanknetNextPage: disc.baanknetNextPage, baanknetTotalPages: disc.baanknetTotalPages };
  if (opts.dryRun) {
    for (const u of fresh.slice(0, 15)) say(`    would read: ${u}`);
    out.seen = [...seen];
    return out;
  }

  const deepener = makeDeepener({ pageUrl: opts.startUrl, maxListings: maxNew, deadline, deps });
  const source = `feed:${opts.feedName}`;
  // Pages are fetched and read by the AI side by side; the database writes go one at a time (so two reads of the same
  // property can never both create it).
  const todo = fresh.slice(0, maxNew);
  let next = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      const res = await deepener.fromUrl(url, disc.via[url]);
      if (!res.attempted) { out.pending = true; return; }
      // read (even if it was not a property or a duplicate): not asked again. A TEMPORARY failure (timeout, 429 / 503, browser trouble) is retried on the next scan.
      const transient = /^(render_timeout|render_error|network_error|http_429|http_503|link_not_found)$/.test(res.reason ?? "");
      if (!transient && (res.records.length > 0 || !/no detail page/i.test(res.note ?? ""))) seen.add(url);
      out.read++;
      if (!res.records.length) {
        out.rejections.push({ url, reasons: [res.reason ?? "detail_page_empty"] });
        say(`  skip   ${url}  (${res.reason ?? "detail_page_empty"}: ${res.note ?? "nothing found"})`);
        continue;
      }
      writes = writes.then(async () => {
        const r = await importRecords(res.records, source, "PUBLISHED", opts.startUrl, { strict: true });
        out.import = { created: out.import.created + r.created, skipped: out.import.skipped + r.skipped, failed: out.import.failed + r.failed, updated: (out.import.updated ?? 0) + (r.updated ?? 0), held: (out.import.held ?? 0) + (r.held ?? 0) };
        for (const j of r.rejections ?? []) out.rejections.push({ url, title: j.title, reasons: j.reasons });
        say(`  ${r.created ? "NEW  " : r.skipped ? "known" : "skip "} ${res.records[0].title?.slice(0, 70)}  [reserve ${res.records[0].reserve_price || "—"}, EMD ${res.records[0].emd || "—"}, docs ${JSON.parse(res.records[0].documents ?? "[]").length}]`);
      }).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 1, 8)) }, worker));
  await writes;
  out.pending = out.pending || next < todo.length || fresh.length > maxNew || !!disc.baanknetNextPage;
  out.rendered = deps.renderStats?.rendered ?? 0;
  await deps.close?.(); // the browser (if one was started) is released
  out.tokens = deepener.stats.tokens;
  out.pdfs = deepener.stats.pdfs;
  if (deepener.stats.notes.length) out.notes.push(...new Set(deepener.stats.notes));
  out.seen = [...seen].slice(-20000);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// What a web source remembers between scans: the listing pages it has already read. Stored inside FeedSource.sheetState
// (which web pages do not otherwise use), so no schema change is needed.
// ---------------------------------------------------------------------------------------------------------------------

export interface WebState {
  seen: string[];
  lastAt: string | null;
  verified?: string[]; // address groups already verified as property pages (not checked again)
  importAll?: boolean; // "Import all now": every tick keeps reading new listings (fast mode) until none are left
}

export function webStateOf(raw: string | null | undefined): WebState {
  try {
    const w = (raw ? JSON.parse(raw) : null)?.web;
    return { seen: Array.isArray(w?.seen) ? w.seen.filter((s: unknown): s is string => typeof s === "string") : [], lastAt: typeof w?.lastAt === "string" ? w.lastAt : null, importAll: w?.importAll === true, verified: Array.isArray(w?.verified) ? w.verified.filter((x: unknown): x is string => typeof x === "string") : [] };
  } catch {
    return { seen: [], lastAt: null };
  }
}

export function withWebState(raw: string | null | undefined, web: WebState): string {
  let j: Record<string, unknown> = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { /* start fresh */ }
  j.web = web;
  return JSON.stringify(j);
}