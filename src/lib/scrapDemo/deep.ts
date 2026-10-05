import { RELATED_WORDS, docType, extractDocuments, extractImages, extractJsonLd, extractLinks, extractMap, type RawLink } from "./crawl";
import { guessKind, idFromUrl } from "./detect";
import { PageLoader, normUrl, type Kept } from "./scan";
import type { SourceText } from "./extract";
import type { DocRef, ImageRef, LinkRef, PageRef } from "./types";

/*
 * AI Python Scrap — DEMO: the deep scan of the ONE selected property. It follows only that property's own public pages
 * (auction detail, notices, inspection, terms, documents), never another property, and builds the SourcePackage.
 */

export interface DeepOutput {
  sources: SourceText[];
  pages: PageRef[];
  documents: DocRef[];
  images: ImageRef[];
  links: LinkRef[];
  geo: { mapUrl: string | null; lat: number | null; lng: number | null };
  jsonLd: string[];
  refused: { url: string; reason: string }[];
  detail: { url: string; html: string; text: string; title: string | null };
  relatedCount: number;
}

const SKIP = /(login|signin|sign-in|register|signup|logout|cart|account|blog|career|sitemap|privacy|faq|javascript:|mailto:|tel:)/i;

export async function deepScan(chosen: Kept, loader: PageLoader, startUrl: string): Promise<DeepOutput> {
  const crawler = loader.crawler;
  const settings = loader.settings;
  const sel = chosen.load;
  const idToken = idFromUrl(chosen.url);
  const selId = sel.det.detected.propertyId ?? sel.det.detected.auctionId;

  const pages: PageRef[] = [{ url: chosen.url, label: sel.rendered ? "Property detail page (browser-rendered)" : "Property detail page", status: "COLLECTED", httpStatus: sel.httpStatus, chars: sel.html.length }];
  const refused: DeepOutput["refused"] = [];
  const sources: SourceText[] = [{ id: "S1", label: sel.rendered ? "Property detail page (browser-rendered)" : "Property detail page", text: sel.stats.text.slice(0, 20_000) }];

  const detailLinks = extractLinks(sel.html, chosen.url);
  let documents = extractDocuments(detailLinks, chosen.url);
  const images: ImageRef[] = extractImages(sel.html, chosen.url, chosen.url);
  const jsonLd = extractJsonLd(sel.html);
  let geo = extractMap(sel.html, detailLinks);

  const seen = new Set<string>([normUrl(chosen.url)]);
  const isRelated = (l: RawLink): boolean => {
    if (!crawler.sameSite(l.url) || SKIP.test(new URL(l.url).pathname)) return false;
    const k = guessKind(l);
    if (k === "DOCUMENT" || k === "IMAGE" || k === "HOME") return false;
    const sameId = !!idToken && l.url.includes(idToken);
    if (k === "PROPERTY") return sameId; // another property's page is never related
    if (k === "AUCTION") return sameId || /(auction|bid|view|detail)/i.test(l.text);
    return sameId || RELATED_WORDS.test(`${l.text} ${new URL(l.url).pathname}`);
  };

  let fetched = 0;
  let related = 0;
  const maxFetch = Math.max(0, settings.maxDeepPages - 1);
  const todo: { link: RawLink; depth: number }[] = detailLinks.filter(isRelated).slice(0, maxFetch).map((link) => ({ link, depth: 1 }));
  let auctionPages = 0;

  while (todo.length && fetched < maxFetch && crawler.timeLeft() > 6_000) {
    const { link, depth } = todo.shift()!;
    const n = normUrl(link.url);
    if (seen.has(n)) continue;
    seen.add(n);
    const kind = guessKind(link);
    if (kind === "AUCTION" && auctionPages >= 3) continue;
    fetched++;
    const res = await loader.load(link.url, { depth, kind, phase: "deep", allowRender: true });
    if (!res.ok) {
      pages.push({ url: link.url, label: "Related page", status: res.refused ? "REFUSED" : "FAILED", httpStatus: null, chars: 0, note: res.reason });
      if (res.refused) refused.push({ url: link.url, reason: res.reason });
      continue;
    }
    // Another property's page: not part of this package.
    const otherId = res.det.detected.propertyId ?? res.det.detected.auctionId;
    if (res.det.score >= 51 && otherId && selId && otherId !== selId && !(idToken && res.url.includes(idToken))) {
      pages.push({ url: res.url, label: "Related page", status: "COLLECTED", httpStatus: res.httpStatus, chars: res.html.length, note: `skipped: it describes a different property (${otherId})` });
      continue;
    }
    related++;
    if (kind === "AUCTION") auctionPages++;
    const label = kind === "AUCTION" ? "Auction detail page" : `Related page: ${link.text || new URL(link.url).pathname}`.slice(0, 120);
    sources.push({ id: `S${sources.length + 1}`, label: res.rendered ? `${label} (browser-rendered)` : label, text: res.stats.text.slice(0, kind === "AUCTION" ? 12_000 : 5_000) });
    pages.push({ url: res.url, label: kind === "AUCTION" ? "Auction detail page" : "Related page", status: "COLLECTED", httpStatus: res.httpStatus, chars: res.html.length });
    const rl = extractLinks(res.html, res.url);
    for (const d of extractDocuments(rl, res.url)) if (!documents.some((x) => x.url === d.url)) documents.push(d);
    for (const im of extractImages(res.html, res.url, res.url)) if (!images.some((x) => x.url === im.url)) images.push(im);
    if (!geo.mapUrl && geo.lat === null) geo = extractMap(res.html, rl);
    if (depth < 2) for (const l of rl.filter(isRelated).slice(0, 4)) todo.push({ link: l, depth: depth + 1 });
  }

  // Documents: ask each document's own server for its type and size (HEAD, robots-checked, same site only).
  for (const d of documents.slice(0, 10)) {
    const h = await crawler.head(d.url);
    d.check = h.check;
    d.mime = h.mime ?? d.mime;
    d.sizeBytes = h.sizeBytes;
    d.date = h.date;
    if (h.check === "REFUSED") refused.push({ url: d.url, reason: "document refused automated access (robots or HTTP 401/403/429)" });
  }
  documents = documents.map((d) => ({ ...d, type: d.type || docType(d.title, d.url) }));

  if (jsonLd.length) sources.push({ id: `S${sources.length + 1}`, label: "Structured data (JSON-LD)", text: jsonLd.join("\n").slice(0, 4000) });
  if (documents.length || geo.mapUrl) {
    sources.push({
      id: `S${sources.length + 1}`,
      label: "Links found on the property pages (document titles, map)",
      text: [...documents.map((d) => `${d.type}: ${d.title} (${d.url})`), geo.mapUrl ? `Map: ${geo.mapUrl}` : "", geo.lat !== null ? `Position: ${geo.lat}, ${geo.lng}` : ""].filter(Boolean).join("\n").slice(0, 3000),
    });
  }

  const links: LinkRef[] = [
    { kind: "Property detail", url: chosen.url },
    { kind: "Official source", url: new URL(startUrl).origin },
    ...pages.filter((p) => p.label === "Auction detail page" && p.status === "COLLECTED").map((p): LinkRef => ({ kind: "Auction", url: p.url })),
    ...documents.map((d): LinkRef => ({ kind: /notice/i.test(d.type) ? "Bank notice" : "Document", url: d.url })),
    ...images.slice(0, 10).map((i): LinkRef => ({ kind: "Image", url: i.url })),
    ...(geo.mapUrl ? [{ kind: "Map" as const, url: geo.mapUrl }] : []),
    ...detailLinks.filter((l) => /inspection/i.test(l.text) && crawler.sameSite(l.url)).slice(0, 2).map((l): LinkRef => ({ kind: "Inspection", url: l.url })),
  ];

  return { sources, pages, documents, images, links, geo, jsonLd, refused, detail: { url: chosen.url, html: sel.html, text: sel.stats.text, title: sel.stats.h1 ?? sel.stats.title }, relatedCount: related };
}
