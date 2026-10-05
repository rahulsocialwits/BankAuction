import { Crawler, Failed, Refused, extractDocuments, extractImages, extractLinks, type RawLink } from "./crawl";
import { BrowserRenderer } from "./browser";
import { classifyPage, findPagination, guessKind, isJsShell, pageState, pageStats, scoreProperty, type Detection, type PageStats } from "./detect";
import type { ScanSettings } from "./settings";
import type { CandidateDiag, PageDebug, PageDiagnostics, PageKind, ScanSummary } from "./types";

/*
 * AI Python Scrap — DEMO: a bounded website scanner.
 *   robots.txt → sitemaps → recursive same-domain crawl (priority queue, pagination, URL normalisation, visited set)
 *   → every page is fetched as HTTP; a JavaScript shell is rendered in a browser; then scored as "property or not".
 * It only reads pages the site allows, stays on one domain, and stops at anything the site refuses.
 */

export const VEHICLE = /\b(vehicle|car|cars|bike|motorcycle|scooter|truck|tractor|two[- ]wheeler|four[- ]wheeler|innova|machinery)\b/i;

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|source$|_ga$)/i;

/** One address per page: no #fragment, no tracking parameters, sorted query, no trailing slash, no www., no index.html. */
export function normUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/index\.(html?|php)$/i, "/").replace(/\/+$/, "") || "/";
  return u.toString();
}

// ---------------------------------------------------------------------------------------------------------------------
// Loading one page (HTTP first, browser only when the HTML is a JavaScript shell)
// ---------------------------------------------------------------------------------------------------------------------

export interface LoadOk {
  ok: true;
  url: string;
  html: string;
  stats: PageStats;
  shell: boolean;
  shellWhy: string;
  det: Detection;
  mode: "HTTP" | "BROWSER";
  rendered: boolean;
  ms: number;
  httpStatus: number | null;
  note: string; // why the browser was or was not used, and what it found
  apiRefused: string[];
  diagnostics: PageDiagnostics;
}
export interface LoadFail {
  ok: false;
  refused: boolean;
  reason: string;
  ms: number;
}

export interface LoadCtx {
  depth: number;
  kind: PageKind;
  phase: "scan" | "deep";
  allowRender: boolean;
}

/** Plain-language reason for a page's state: what we saw and what that means. */
export function explain(l: LoadOk): string {
  const d = l.det;
  const sig = `${d.signals.length} of ${d.signalsTotal} property signals${d.signals.length ? ` (${d.signals.join(", ")})` : ""}`;
  const mode = l.rendered ? "The browser-rendered page" : "The HTTP HTML";
  if (d.score >= 51) return `${mode} shows ${sig}; score ${d.score}.`;
  if (l.shell && !l.rendered) return `Page state JS_SHELL: the initial HTML contains an application shell but insufficient visible property content (${l.shellWhy}). ${l.note}`.trim();
  if (l.rendered) return `After browser rendering the page has ${l.stats.textChars.toLocaleString("en-IN")} characters and ${sig}; score ${d.score}. ${l.note}`.trim();
  return `Static page with ${l.stats.textChars.toLocaleString("en-IN")} characters and ${sig}; score ${d.score}.${d.listingLike ? " It looks like a list of properties, not one property." : ""}`;
}

export class PageLoader {
  rows: PageDebug[] = [];
  browserUsed = 0;
  browserStatus = "not needed so far";

  constructor(
    readonly crawler: Crawler,
    readonly renderer: BrowserRenderer,
    readonly settings: ScanSettings,
  ) {}

  private push(url: string, c: LoadCtx, p: Partial<PageDebug> & Pick<PageDebug, "mode" | "ms" | "reason">) {
    this.rows.push({ phase: c.phase, url, depth: c.depth, kind: c.kind, httpStatus: null, links: 0, textChars: 0, scripts: 0, jsShell: false, score: null, label: null, ...p });
  }

  async load(url: string, c: LoadCtx): Promise<LoadOk | LoadFail> {
    const t0 = Date.now();
    let fetched: Awaited<ReturnType<Crawler["page"]>>;
    try {
      fetched = await this.crawler.page(url);
    } catch (e) {
      const refused = e instanceof Refused;
      const reason = e instanceof Error ? e.message : String(e);
      this.push(url, c, { mode: refused ? "REFUSED" : "FAILED", ms: Date.now() - t0, reason });
      return { ok: false, refused, reason, ms: Date.now() - t0 };
    }
    let html = fetched.html;
    let stats = pageStats(html);
    const httpStats = stats;
    let sh = isJsShell(stats);
    let det = scoreProperty(stats, html, fetched.url);
    let rendered = false;
    let note = "";
    let apiRefused: string[] = [];
    let httpStatus: number | null = fetched.status;

    const looksLikeDetailUrl = c.kind === "PROPERTY" || c.kind === "AUCTION";
    const needRender = sh.shell || (det.score < 51 && looksLikeDetailUrl && stats.textChars < 2000);
    if (needRender) {
      if (!c.allowRender || !this.settings.useBrowser) note = "Browser rendering is switched off for this page.";
      else if (this.browserUsed >= this.settings.maxBrowserPages) note = `Browser rendering limit reached (${this.settings.maxBrowserPages} pages).`;
      else if (this.crawler.timeLeft() < 20_000) note = "Browser rendering skipped: not enough time left.";
      else {
        const r = await this.renderer.render(fetched.url, this.crawler);
        if (r.ok) {
          this.browserUsed++;
          this.browserStatus = `rendered ${this.browserUsed} page(s) via ${this.renderer.how}`;
          html = r.html;
          stats = pageStats(html);
          sh = isJsShell(stats);
          det = scoreProperty(stats, html, r.finalUrl);
          rendered = true;
          httpStatus = r.status ?? httpStatus;
          apiRefused = r.apiRefused;
          note = `Rendered in a browser in ${(r.ms / 1000).toFixed(1)} s.${r.blocked.length ? ` Data requests not made (policy): ${r.blocked.join("; ")}.` : ""}${r.apiRefused.length ? ` The page's own data requests were refused (${r.apiRefused.join("; ")}): NEEDS AUTHORISED SOURCE.` : ""}`;
        } else if (r.kind === "UNAVAILABLE") {
          this.browserStatus = r.reason;
          note = r.reason;
        } else {
          this.browserUsed++;
          this.browserStatus = `${r.kind}: ${r.reason}`;
          if (r.kind === "REFUSED") {
            this.push(fetched.url, c, { mode: "REFUSED", ms: Date.now() - t0, httpStatus, textChars: stats.textChars, scripts: stats.scripts, jsShell: sh.shell, reason: `REFUSED in the browser: ${r.reason}` });
            return { ok: false, refused: true, reason: r.reason, ms: Date.now() - t0 };
          }
          note = `Browser rendering failed: ${r.reason}`;
        }
      }
    }

    const diagnostics: PageDiagnostics = {
      finalUrl: fetched.url,
      contentType: fetched.contentType,
      redirects: fetched.redirects,
      htmlChars: fetched.html.length,
      httpTextChars: httpStats.textChars,
      renderedTextChars: rendered ? stats.textChars : null,
      title: stats.title,
      h1: stats.h1,
      h2Count: stats.h2Count,
      scripts: stats.scripts,
      links: stats.links,
      images: stats.images,
      jsonLdCount: stats.jsonLdCount,
      keywords: stats.keywords,
      renderMode: rendered ? "BROWSER_RENDER" : "HTTP_HTML",
      pageState: pageState(stats, det, sh.shell),
      shellWhy: sh.why,
    };
    const ok: LoadOk = { ok: true, url: fetched.url, html, stats, shell: sh.shell, shellWhy: sh.why, det, mode: rendered ? "BROWSER" : "HTTP", rendered, ms: Date.now() - t0, httpStatus, note, apiRefused, diagnostics };
    this.push(fetched.url, c, {
      mode: ok.mode,
      ms: ok.ms,
      httpStatus,
      links: stats.links,
      textChars: stats.textChars,
      scripts: stats.scripts,
      jsShell: sh.shell,
      score: det.score,
      label: det.label,
      reason: explain(ok),
    });
    return ok;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The website scan
// ---------------------------------------------------------------------------------------------------------------------

export interface Kept {
  url: string;
  guessKind: PageKind;
  depth: number;
  load: LoadOk;
}

interface QItem {
  url: string;
  depth: number;
  kind: PageKind;
  priority: number;
  from: string | null;
}

export interface ScanOutput {
  summary: ScanSummary;
  kept: Kept[]; // every fetched page that could be a property page (score >= 21) or a detail-URL candidate
  candidateIndex: { url: string; text: string; kind: PageKind; fetched: boolean }[];
  path: string[];
  stopReason: string;
}

const PRIORITY: Record<PageKind, number> = { PROPERTY: 100, AUCTION: 100, PAGINATION: 80, LISTING: 70, SEARCH: 60, LOCATION: 50, NAVIGATION: 40, NOTICE: 20, OTHER: 10, HOME: 90, DOCUMENT: 0, IMAGE: 0 };

/** Sitemap files the site declares (robots.txt) or publishes at /sitemap.xml: robots-checked, a few files only. */
async function readSitemaps(crawler: Crawler, startUrl: string): Promise<{ urls: string[]; note: string }> {
  const origin = new URL(startUrl).origin;
  const files = [...new Set([...crawler.declaredSitemaps(origin), `${origin}/sitemap.xml`])].filter((u) => crawler.sameSite(u)).slice(0, 4);
  const urls: string[] = [];
  let read = 0;
  const loc = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const queue = [...files];
  while (queue.length && read < 6) {
    const f = queue.shift()!;
    const xml = await crawler.xml(f);
    if (!xml) continue;
    read++;
    const found = loc(xml);
    if (/<sitemapindex/i.test(xml)) queue.push(...found.filter((u) => crawler.sameSite(u)).slice(0, 5));
    else urls.push(...found.slice(0, 5000));
  }
  return { urls: [...new Set(urls)].filter((u) => crawler.sameSite(u)), note: read ? `${read} sitemap file(s) read, ${urls.length} address(es) listed` : "no public sitemap found (or robots.txt does not allow it)" };
}

export async function scanSite(startUrl: string, settings: ScanSettings, loader: PageLoader): Promise<ScanOutput> {
  const crawler = loader.crawler;
  const visited = new Set<string>();
  const known = new Set<string>(); // every address seen (queued, fetched or skipped)
  const queue: QItem[] = [];
  const kept: Kept[] = [];
  const candIdx = new Map<string, { url: string; text: string; kind: PageKind; fetched: boolean }>();
  const docs = new Set<string>();
  const imgs = new Set<string>();
  const paginationPerPath = new Map<string, number>();
  const counts = { scanned: 0, refused: 0, failed: 0, listing: 0, pagination: 0, candidatesChecked: 0, confirmed: 0 };
  let sitemapNote = "sitemap discovery switched off";
  let sitemapUrls = 0;
  let stopReason = "no new addresses to scan";

  const enqueue = (url: string, depth: number, kind: PageKind, from: string | null, bonus = 0) => {
    const n = normUrl(url);
    known.add(n);
    if (visited.has(n) || queue.some((q) => normUrl(q.url) === n)) return;
    queue.push({ url, depth, kind, from, priority: PRIORITY[kind] - depth + bonus });
  };

  // robots.txt first; the start page itself is fetched (and checked) by the loader.
  const startVerdict = await crawler.robotsFor(startUrl);
  if (startVerdict === "disallowed") throw new Refused(`robots.txt: ${new URL(startUrl).hostname} does not allow our crawler on ${new URL(startUrl).pathname || "/"} (or robots.txt itself answers 401/403). The page was not requested.`);
  if (startVerdict === "unreachable") throw new Failed(`${new URL(startUrl).hostname}/robots.txt request got no reply from the site (15 s). Some sites silently ignore automated requests; that is the site's own choice and the demo never works around it. No page request was made. Try again later, or use pasted text, a PDF or an authorised feed.`);

  enqueue(startUrl, 0, "HOME", null, 1000);

  if (settings.useSitemap) {
    const sm = await readSitemaps(crawler, startUrl);
    sitemapNote = sm.note;
    sitemapUrls = sm.urls.length;
    let props = 0;
    let lists = 0;
    for (const u of sm.urls) {
      const link: RawLink = { url: u, text: "" };
      const kind = guessKind(link);
      const n = normUrl(u);
      if ((kind === "PROPERTY" || kind === "AUCTION") && props < settings.maxCandidates * 2) {
        props++;
        candIdx.set(n, { url: u, text: "(from sitemap)", kind, fetched: false });
        enqueue(u, 1, kind, "sitemap", -5);
      } else if ((kind === "LISTING" || kind === "SEARCH" || kind === "LOCATION") && lists < 20) {
        lists++;
        enqueue(u, 1, kind, "sitemap");
      }
    }
  }

  const sufficient = () => counts.candidatesChecked >= settings.maxCandidates && counts.confirmed >= 1;

  const processItem = async (item: QItem) => {
    const n = normUrl(item.url);
    visited.add(n);
    const isCand = item.kind === "PROPERTY" || item.kind === "AUCTION";
    const worthRendering = item.depth === 0 || ["PROPERTY", "AUCTION", "LISTING", "SEARCH", "PAGINATION", "LOCATION"].includes(item.kind);
    const res = await loader.load(item.url, { depth: item.depth, kind: item.kind, phase: "scan", allowRender: worthRendering });
    if (!res.ok) {
      if (res.refused) counts.refused++; else counts.failed++;
      if (item.depth === 0) throw res.refused ? new Refused(`REFUSED — ${res.reason}`) : new Failed(`FAILED — ${res.reason}`);
      return;
    }
    counts.scanned++;
    const fin = normUrl(res.url);
    visited.add(fin);
    const kind = classifyPage(item.kind, res.det, res.stats, item.depth);
    if (kind === "LISTING") counts.listing++;
    if (kind === "PAGINATION") counts.pagination++;
    if (isCand) {
      counts.candidatesChecked++;
      const c = candIdx.get(n);
      if (c) c.fetched = true;
    }
    if (res.det.score >= 51 && !res.det.listingLike) counts.confirmed++;
    if (res.det.score >= 21 || isCand || item.depth === 0) kept.push({ url: res.url, guessKind: item.kind, depth: item.depth, load: res });
    // keep memory small: only the best pages keep their HTML
    if (kept.length > 14) {
      kept.sort((a, b) => b.load.det.score - a.load.det.score);
      for (const k of kept.slice(14)) k.load.html = "";
      kept.length = 14;
    }

    const links = extractLinks(res.html, res.url).filter((l) => crawler.sameSite(l.url));
    for (const d of extractDocuments(links, res.url)) docs.add(normUrl(d.url));
    for (const im of extractImages(res.html, res.url, res.url)) imgs.add(im.url);

    // Pagination of a listing page (follow a few pages per list)
    if (kind === "LISTING" || kind === "SEARCH" || kind === "PAGINATION" || kind === "HOME") {
      for (const l of findPagination(links, res.url)) {
        const base = new URL(l.url).origin + new URL(l.url).pathname;
        const used = paginationPerPath.get(base) ?? 0;
        if (used >= 5) continue;
        if (!known.has(normUrl(l.url))) { paginationPerPath.set(base, used + 1); enqueue(l.url, item.depth, "PAGINATION", res.url, 5); }
      }
    }

    if (item.depth >= settings.maxDepth) return;
    for (const l of links) {
      const ln = normUrl(l.url);
      const k = guessKind(l);
      if (k === "DOCUMENT" || k === "IMAGE") continue;
      if ((k === "PROPERTY" || k === "AUCTION") && !candIdx.has(ln)) candIdx.set(ln, { url: l.url, text: l.text, kind: k, fetched: false });
      if (known.has(ln)) continue;
      // Once enough detail pages were checked, more detail links are only indexed, not fetched.
      const overCap = (k === "PROPERTY" || k === "AUCTION") && counts.candidatesChecked + queue.filter((q) => q.kind === "PROPERTY" || q.kind === "AUCTION").length >= settings.maxCandidates;
      known.add(ln);
      if (overCap) continue;
      if (queue.length < 600) enqueue(l.url, item.depth + 1, k, res.url);
    }
  };

  while (true) {
    if (counts.scanned + counts.refused + counts.failed >= settings.maxPages) { stopReason = `page limit reached (${settings.maxPages})`; break; }
    if (crawler.timeLeft() < 8_000) { stopReason = "time limit reached"; break; }
    if (sufficient()) { stopReason = `enough property candidates found (${counts.candidatesChecked} checked, ${counts.confirmed} confirmed)`; break; }
    if (queue.length === 0) break;
    queue.sort((a, b) => b.priority - a.priority);
    const room = settings.maxPages - (counts.scanned + counts.refused + counts.failed);
    const batch = queue.splice(0, Math.min(settings.concurrency, room));
    // the start page must finish first (it seeds everything)
    try {
      await Promise.all(batch.map(processItem));
    } catch (e) {
      if (e instanceof Refused || (e instanceof Failed && counts.scanned === 0)) throw e;
      if (e instanceof Failed) { stopReason = e.message; break; }
      throw e;
    }
  }

  const candidates = [...candIdx.values()];
  const summary: ScanSummary = {
    startUrl,
    domain: new URL(startUrl).hostname,
    pagesDiscovered: known.size,
    pagesScanned: counts.scanned,
    pagesSkipped: Math.max(0, known.size - visited.size),
    pagesRefused: counts.refused,
    pagesFailed: counts.failed,
    propertyCandidates: candidates.length,
    candidatesChecked: counts.candidatesChecked,
    listingPages: counts.listing,
    paginationPages: counts.pagination,
    documentsFound: docs.size,
    imagesFound: imgs.size,
    sitemapUrls,
    sitemapNote,
    browser: { requested: settings.useBrowser, used: loader.browserUsed, status: loader.browserStatus },
  };
  const path = ["Start page", ...(counts.listing || counts.pagination ? ["Listing / search pages"] : []), "Property candidates"];
  return { summary, kept, candidateIndex: candidates, path, stopReason };
}

// ---------------------------------------------------------------------------------------------------------------------
// Selecting ONE property and explaining every candidate
// ---------------------------------------------------------------------------------------------------------------------

export function selectProperty(scan: ScanOutput): { chosen: Kept | null; diag: CandidateDiag[]; why: string } {
  const pool = scan.kept.filter((k) => k.depth > 0 || k.load.det.score >= 51);
  const vehicle = (k: Kept) => VEHICLE.test(`${k.load.stats.h1 ?? ""} ${k.load.stats.title ?? ""} ${k.load.stats.text.slice(0, 600)}`);
  const ranked = [...pool].sort((a, b) => b.load.det.score - a.load.det.score);
  let chosen: Kept | null = ranked.find((k) => k.load.det.score >= 51 && !k.load.det.listingLike && !vehicle(k)) ?? null;
  let why = "";
  if (!chosen) {
    const weak = ranked.find((k) => k.load.det.score >= 30 && !k.load.det.listingLike && !vehicle(k));
    if (weak) { chosen = weak; why = `No page reached 51 (strong); the best "possible" page (score ${weak.load.det.score}) is used.`; }
  }

  const diag: CandidateDiag[] = ranked.slice(0, 12).map((k) => {
    const l = k.load;
    const accepted = chosen === k;
    const v = vehicle(k);
    let reason = explainShort(k);
    if (accepted) reason = `ACCEPTED: highest property score. ${reason}`;
    else if (v) reason = `REJECTED: vehicle (vehicles are never imported). ${reason}`;
    else if (l.det.listingLike) reason = `REJECTED: it is a list of properties. ${reason}`;
    else if (l.det.score >= 51) reason = `Valid, but another page scored higher. ${reason}`;
    else reason = `REJECTED: score ${l.det.score} is below the property threshold (51). ${reason}`;
    return {
      diagnostics: l.diagnostics,
      url: k.url,
      kind: k.guessKind,
      httpStatus: l.httpStatus,
      rendered: l.rendered,
      jsShell: l.shell,
      textChars: l.stats.textChars,
      score: l.det.score,
      label: l.det.label,
      signalsFound: l.det.signals.length,
      signalsTotal: l.det.signalsTotal,
      signals: l.det.signals,
      title: l.det.detected.title,
      propertyId: l.det.detected.propertyId ?? l.det.detected.auctionId,
      reserve: l.det.detected.reserve,
      auctionDate: l.det.detected.auctionDate,
      verdict: accepted ? "ACCEPTED" : "REJECTED",
      reason,
    };
  });
  // Candidates the scan never fetched (limits): listed so nothing is silently dropped.
  for (const c of scan.candidateIndex.filter((x) => !x.fetched).slice(0, 4)) {
    diag.push({ diagnostics: null, url: c.url, kind: c.kind, httpStatus: null, rendered: false, jsShell: false, textChars: 0, score: null, label: null, signalsFound: 0, signalsTotal: 14, signals: [], title: c.text || null, propertyId: null, reserve: null, auctionDate: null, verdict: "NOT FETCHED", reason: "Found as a link but not fetched (page, time or candidate limit reached)." });
  }
  return { chosen, diag, why };
}

function explainShort(k: Kept): string {
  return explain(k.load);
}
