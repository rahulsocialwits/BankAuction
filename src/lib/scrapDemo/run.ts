import { prisma } from "@/lib/db/prisma";
import { MOCK_FIELDS, SAMPLE_NOTICE } from "./sample";
import { FIELDS, REQUIRED_KEYS } from "./fields";
import { extractProperty, verify, type SourceText } from "./extract";
import {
  Crawler,
  Failed,
  Refused,
  docType,
  extractDocuments,
  extractImages,
  extractJsonLd,
  extractLinks,
  extractMap,
  htmlToText,
  isDetailCandidate,
  listingScore,
  looksLikeProperty,
  pageTitle,
  relatedLinks,
  toCandidates,
  type Fetched,
  type RawLink,
} from "./crawl";
import type { Candidate, DemoResult, DemoSourceType, DemoStep, DocRef, FieldValue, ImageRef, LinkRef, PageRef, StepState } from "./types";

/*
 * AI Python Scrap — DEMO (isolated): finds ONE property on a permitted public website and collects it in depth.
 * Read-only use of existing code: the Relay client + AI rules (via extract.ts), the demo robots gate (own copy), and a
 * read-only Property lookup for the duplicate warning. Nothing is written anywhere.
 */

const VEHICLE = /\b(vehicle|car|cars|bike|motorcycle|scooter|truck|tractor|two[- ]wheeler|four[- ]wheeler|innova|machinery)\b/i;
const MAX_REQUESTS = 22;
const MAX_LISTING_PAGES = 3;
const MAX_TRIES = 4;
const TIME_LIMIT_MS = 45_000;

// DEMO-ONLY deny-list. It is empty on purpose: the demo performs the normal access checks and shows the site's real answer.
// (The production pipeline keeps its own, separate list; nothing here changes it.)
const DEMO_DENY_LIST: string[] = [];

const num = (s: string | null | undefined): number | null => {
  const n = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function duplicateOf(title: string | null, price: number | null): Promise<string | null> {
  if (!title) return null;
  try {
    const head = title.slice(0, 28);
    const hit = await prisma.property.findFirst({
      where: {
        OR: [
          { title: { equals: title, mode: "insensitive" } },
          ...(price ? [{ title: { startsWith: head, mode: "insensitive" as const }, auctions: { some: { reservePrice: price } } }] : []),
        ],
      },
      select: { title: true },
    });
    return hit?.title ?? null;
  } catch {
    return null;
  }
}

const dateOk = (v: string) => /\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(v);

export async function runDemo(input: { name: string; type: DemoSourceType; url: string; pasted: string; mock: boolean }): Promise<DemoResult> {
  const t0 = Date.now();
  const steps: DemoStep[] = [];
  const startUrl = input.type === "url" ? input.url.trim() : null;
  const result: DemoResult = {
    status: "FAILED",
    reason: null,
    durationMs: 0,
    source: { name: input.name || "Demo source", type: input.type, url: startUrl },
    steps,
    access: { host: null, denyListMatch: null, robots: null, httpStatus: null, collection: input.type === "url" ? "NOT STARTED" : "n/a (not a URL source)" },
    limits: { maxPages: MAX_REQUESTS, maxDepth: 2, sameDomainOnly: true, requestsMade: 0 },
    discovery: { startUrl, pagesInspected: 0, linksSeen: 0, candidates: [], candidateTotal: 0, path: [], selected: null },
    collection: { pages: [], documents: [], images: [], links: [], refused: [] },
    extraction: { mode: "NONE", model: null, tokens: null },
    property: null,
    counts: { complete: 0, missing: 0, documents: 0, images: 0, sourcePages: 0, propertiesDiscovered: 0, propertiesSelected: 0, propertiesExtracted: 0 },
    raw: { html: "", text: "", jsonLd: [], truncated: false },
  };

  async function step<T>(state: StepState, fn: () => Promise<T> | T, note?: (v: T) => string): Promise<T> {
    const s = Date.now();
    try {
      const v = await fn();
      steps.push({ state, outcome: "done", ms: Date.now() - s, note: note?.(v) });
      return v;
    } catch (e) {
      steps.push({ state, outcome: e instanceof Refused ? "refused" : "failed", ms: Date.now() - s, note: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  let crawler: Crawler | null = null;
  try {
    steps.push({ state: "QUEUED", outcome: "done", ms: 0, note: "Demo run created in memory (nothing is stored)" });

    // ---- what the property package holds --------------------------------------------------------------------------
    let detail: { url: string; html: string; text: string; title: string | null } | null = null;
    const pageSources: SourceText[] = [];
    let documents: DocRef[] = [];
    let images: ImageRef[] = [];
    let links: LinkRef[] = [];
    let jsonLd: string[] = [];
    let geo: { mapUrl: string | null; lat: number | null; lng: number | null } = { mapUrl: null, lat: null, lng: null };

    if (input.type === "url") {
      if (!startUrl) throw new Failed("Enter a source URL.");
      let start: URL;
      try { start = new URL(startUrl); } catch { throw new Failed("Not a valid web address. Use a full https:// address."); }
      result.access.host = start.hostname;
      const listed = DEMO_DENY_LIST.find((h) => start.hostname === h || start.hostname.endsWith("." + h));
      result.access.denyListMatch = listed ?? null;
      if (listed) throw new Refused(`demo deny-list: "${start.hostname}" matches "${listed}". No request was sent.`);

      crawler = new Crawler(startUrl, MAX_REQUESTS, t0 + TIME_LIMIT_MS);
      const pages: PageRef[] = result.collection.pages;
      const seenPages = new Set<string>();

      const load = async (url: string, label: string): Promise<Fetched | null> => {
        if (seenPages.has(url)) return null;
        seenPages.add(url);
        try {
          const p = await crawler!.page(url);
          pages.push({ url: p.url, label, status: "COLLECTED", httpStatus: p.status, chars: p.html.length });
          if (label === "Start page") { result.access.robots = "allowed"; result.access.httpStatus = p.status; result.access.collection = "COLLECTED"; }
          return p;
        } catch (e) {
          const refused = e instanceof Refused;
          const reason = e instanceof Error ? e.message : String(e);
          pages.push({ url, label, status: refused ? "REFUSED" : "FAILED", httpStatus: null, chars: 0, note: reason });
          if (refused) result.collection.refused.push({ url, reason });
          if (label === "Start page") {
            result.access.collection = refused ? "REFUSED" : "FAILED";
            result.access.robots = /robots\.txt/i.test(reason) ? (refused ? "disallowed" : "unreachable") : "allowed";
            throw refused ? new Refused(`REFUSED — ${reason}`) : new Failed(`FAILED — ${reason}`);
          }
          return null;
        }
      };

      // ---- 1) DISCOVERING: start page → listing pages → property links ---------------------------------------------
      const found = await step(
        "DISCOVERING",
        async () => {
          const startPage = await load(startUrl, "Start page");
          if (!startPage) throw new Failed("Start page could not be read.");
          const all: RawLink[] = [];
          const pathParts = ["Start page"];
          const startLinks = extractLinks(startPage.html, startPage.url).filter((l) => crawler!.sameSite(l.url));
          all.push(...startLinks);
          let candidates = toCandidates(startLinks);

          // The start page may itself be a property detail page.
          const startIsProperty = looksLikeProperty(htmlToText(startPage.html)) && candidates.length === 0;
          if (!startIsProperty && candidates.length < 3) {
            const listing = startLinks.filter((l) => !isDetailCandidate(l) && listingScore(l) >= 2).sort((a, b) => listingScore(b) - listingScore(a)).slice(0, MAX_LISTING_PAGES);
            for (const l of listing) {
              const p = await load(l.url, "Listing / search page");
              if (!p) continue;
              const ls = extractLinks(p.html, p.url).filter((x) => crawler!.sameSite(x.url));
              all.push(...ls);
              const more = toCandidates(ls);
              if (more.length) { candidates = [...candidates, ...more]; if (!pathParts.includes("Listing / search page")) pathParts.push("Listing / search page"); }
              if (candidates.length >= 12) break;
            }
          }
          const uniq = new Map<string, Candidate>();
          for (const c of candidates) if (!uniq.has(c.url)) uniq.set(c.url, c);
          return { startPage, candidates: [...uniq.values()].sort((a, b) => b.score - a.score), pathParts, linksSeen: new Set(all.map((l) => l.url)).size, startIsProperty };
        },
        (f) => `${pages.length} page(s) inspected, ${f.linksSeen} links seen, ${f.candidates.length} property link candidate(s)`,
      );
      result.discovery = {
        startUrl,
        pagesInspected: pages.filter((p) => p.status === "COLLECTED").length,
        linksSeen: found.linksSeen,
        candidates: found.candidates.slice(0, 10),
        candidateTotal: found.candidates.length,
        path: found.pathParts,
        selected: null,
      };
      result.counts.propertiesDiscovered = found.startIsProperty ? 1 : found.candidates.length;

      // ---- 2) SELECTING: exactly ONE valid property --------------------------------------------------------------
      const chosen = await step(
        "SELECTING",
        async () => {
          if (found.startIsProperty) return { page: found.startPage, tries: 0, skipped: [] as string[] };
          const skipped: string[] = [];
          let tries = 0;
          for (const c of found.candidates) {
            if (tries >= MAX_TRIES) break;
            tries++;
            const p = await load(c.url, "Property detail page");
            if (!p) { skipped.push(`${c.url}: could not be read`); continue; }
            const text = htmlToText(p.html);
            if (!looksLikeProperty(text)) { skipped.push(`${c.url}: does not look like a property page`); continue; }
            if (VEHICLE.test(`${pageTitle(p.html) ?? ""} ${text.slice(0, 600)}`)) { skipped.push(`${c.url}: vehicle (never imported)`); continue; }
            return { page: p, tries, skipped };
          }
          throw new Failed(`No valid property page found (${tries} candidate(s) tried${skipped.length ? `: ${skipped.slice(0, 3).join("; ")}` : ""}).`);
        },
        (c) => `Selected 1 property after ${c.tries || 1} try(ies); the others are ignored`,
      );
      const p = chosen.page;
      const text = htmlToText(p.html);
      detail = { url: p.url, html: p.html, text, title: pageTitle(p.html) };
      result.discovery.selected = { title: detail.title, url: detail.url };
      result.discovery.path = [...found.pathParts.filter((x) => x !== "Property detail page"), "Property detail"];
      if (found.startIsProperty) result.discovery.path = ["Start page (is the property page)"];
      result.counts.propertiesSelected = 1;

      // ---- 3) COLLECTING: the same property's own pages, documents, images, links -------------------------------
      await step(
        "COLLECTING",
        async () => {
          const detailLinks = extractLinks(detail!.html, detail!.url);
          documents = extractDocuments(detailLinks, detail!.url);
          images = extractImages(detail!.html, detail!.url, detail!.url);
          jsonLd = extractJsonLd(detail!.html);
          geo = extractMap(detail!.html, detailLinks);

          pageSources.push({ id: "S1", label: "Property detail page", text: text.slice(0, 20_000) });

          // Related public pages of the SAME property (same site only).
          for (const rl of relatedLinks(detailLinks.filter((l) => crawler!.sameSite(l.url)), detail!.url, documents)) {
            const rp = await load(rl.url, "Related page");
            if (!rp) continue;
            const rt = htmlToText(rp.html);
            pageSources.push({ id: `S${pageSources.length + 1}`, label: `Related page: ${rl.text || rl.url}`.slice(0, 120), text: rt.slice(0, 5000) });
            for (const d of extractDocuments(extractLinks(rp.html, rp.url), rp.url)) if (!documents.some((x) => x.url === d.url)) documents.push(d);
            for (const im of extractImages(rp.html, rp.url, rp.url)) if (!images.some((x) => x.url === im.url)) images.push(im);
          }

          // Documents: ask each document's own server for its type and size (HEAD, robots-checked, same site only).
          for (const d of documents.slice(0, 8)) {
            const h = await crawler!.head(d.url);
            d.check = h.check;
            d.mime = h.mime ?? d.mime;
            d.sizeBytes = h.sizeBytes;
            d.date = h.date;
            if (h.check === "REFUSED") result.collection.refused.push({ url: d.url, reason: "document refused automated access (robots or HTTP 401/403/429)" });
          }
          documents = documents.map((d) => ({ ...d, type: d.type || docType(d.title, d.url) }));

          if (jsonLd.length) pageSources.push({ id: `S${pageSources.length + 1}`, label: "Structured data (JSON-LD)", text: jsonLd.join("\n").slice(0, 4000) });
          if (documents.length || geo.mapUrl) {
            pageSources.push({
              id: `S${pageSources.length + 1}`,
              label: "Links found on the property page (document titles, map)",
              text: [...documents.map((d) => `${d.type}: ${d.title} (${d.url})`), geo.mapUrl ? `Map: ${geo.mapUrl}` : "", geo.lat !== null ? `Position: ${geo.lat}, ${geo.lng}` : ""].filter(Boolean).join("\n").slice(0, 3000),
            });
          }

          links = [
            { kind: "Property detail", url: detail!.url },
            { kind: "Official source", url: new URL(startUrl).origin },
            ...documents.map((d): LinkRef => ({ kind: d.type.includes("Notice") ? "Bank notice" : "Document", url: d.url })),
            ...images.slice(0, 10).map((i): LinkRef => ({ kind: "Image", url: i.url })),
            ...(geo.mapUrl ? [{ kind: "Map" as const, url: geo.mapUrl }] : []),
            ...detailLinks.filter((l) => /inspection/i.test(l.text) && crawler!.sameSite(l.url)).slice(0, 2).map((l): LinkRef => ({ kind: "Inspection", url: l.url })),
            ...detailLinks.filter((l) => /(e-?auction|bid now|participate)/i.test(l.text)).slice(0, 2).map((l): LinkRef => ({ kind: "Auction", url: l.url })),
          ];
          return true;
        },
        () => `${pageSources.length} source block(s), ${documents.length} document reference(s), ${images.length} image reference(s), ${result.collection.refused.length} refused`,
      );
    } else {
      // Sample or pasted text: it is the "property page"; discovery is not needed.
      const text = input.type === "sample" ? SAMPLE_NOTICE : input.pasted.slice(0, 200_000);
      steps.push({ state: "DISCOVERING", outcome: "skipped", ms: 0, note: "Not a website: nothing to discover" });
      steps.push({ state: "SELECTING", outcome: "skipped", ms: 0, note: "The first property described in the text is used" });
      await step("COLLECTING", () => (text.trim().length < 40 ? Promise.reject(new Failed("Paste the notice text first (at least a few lines).")) : true), () => `${text.length.toLocaleString("en-IN")} characters (${input.type === "sample" ? "built-in sample" : "pasted"})`);
      detail = { url: "", html: text, text, title: null };
      pageSources.push({ id: "S1", label: input.type === "sample" ? "Built-in sample notice" : "Pasted notice text", text: text.slice(0, 30_000) });
      result.counts.propertiesDiscovered = 1;
      result.counts.propertiesSelected = 1;
      result.discovery.path = [input.type === "sample" ? "Sample notice" : "Pasted text"];
    }

    result.limits.requestsMade = crawler?.requests ?? 0;
    result.collection.documents = documents;
    result.collection.images = images;
    result.collection.links = links;
    result.raw = { html: detail.html.slice(0, 60_000), text: detail.text.slice(0, 60_000), jsonLd, truncated: detail.html.length > 60_000 || detail.text.length > 60_000 };

    await step("NORMALIZING", () => (detail!.text.trim().length < 40 ? Promise.reject(new Failed("Almost no readable text was found on the property page.")) : true), () => `Source package: ${pageSources.length} text block(s), raw HTML kept separately (${detail!.html.length.toLocaleString("en-IN")} characters)`);

    // ---- 4) EXTRACTING: ONE property through the existing Relay client -------------------------------------------
    const ex = await step(
      "EXTRACTING",
      async () => {
        if (input.mock && input.type === "sample") {
          return { fields: Object.fromEntries(Object.entries(MOCK_FIELDS).map(([k, v]) => [k, { value: v, source: "S1" }])), vehicle: false, model: null as string | null, tokens: null as number | null, mode: "MOCK" as const };
        }
        const e = await extractProperty(pageSources);
        return { ...e, mode: "AI" as const };
      },
      (e) => `${Object.keys(e.fields).length} field(s) found via ${e.mode === "AI" ? "the existing Relay extraction" : "MOCK sample response"}${e.vehicle ? " (vehicle)" : ""}`,
    );
    result.extraction = { mode: ex.mode, model: ex.model, tokens: ex.tokens };

    // ---- 5) VALIDATING ---------------------------------------------------------------------------------------------
    const prop = await step(
      "VALIDATING",
      async () => {
        const textOf = new Map(pageSources.map((s) => [s.id, s.text]));
        const labelOf = new Map(pageSources.map((s) => [s.id, s.label]));
        const warnings: string[] = [];
        const fields: FieldValue[] = FIELDS.map((d) => {
          const got = ex.fields[d.key];
          const value = got?.value ?? null;
          const src = got?.source && textOf.has(got.source) ? got.source : value ? "S1" : null;
          const ok = value && src ? verify(d, value, textOf.get(src) ?? "") || verify(d, value, [...textOf.values()].join("\n")) : null;
          if (value && ok === false) warnings.push(`${d.label}: the value was not found word-for-word in the source (check it before trusting it).`);
          if (value && d.kind === "money" && !num(value)) warnings.push(`${d.label}: price format not recognised ("${value.slice(0, 30)}").`);
          if (value && d.kind === "date" && !dateOk(value)) warnings.push(`${d.label}: date format not recognised ("${value.slice(0, 30)}").`);
          return { key: d.key, label: d.label, group: d.group, value, source: src ? `${src} · ${labelOf.get(src) ?? ""}`.trim() : null, verified: ok };
        });
        // Coordinates/map found directly on the page fill the position fields when the AI did not.
        const setIf = (key: string, value: string | null, why: string) => {
          const f = fields.find((x) => x.key === key);
          if (f && !f.value && value) { f.value = value; f.source = why; f.verified = true; }
        };
        if (geo.lat !== null) setIf("latitude", String(geo.lat), "page (map link / meta tag)");
        if (geo.lng !== null) setIf("longitude", String(geo.lng), "page (map link / meta tag)");
        setIf("map_url", geo.mapUrl, "page (map link)");

        const val = (k: string) => fields.find((f) => f.key === k)?.value ?? null;
        for (const k of REQUIRED_KEYS) if (!val(k)) warnings.push(`Required field missing: ${FIELDS.find((f) => f.key === k)?.label}.`);
        const pin = val("pincode");
        if (pin && !/^[1-9]\d{5}$/.test(pin.replace(/\s/g, ""))) warnings.push(`Pincode "${pin}" is not a valid 6-digit pincode.`);
        const vehicle = ex.vehicle || VEHICLE.test(`${val("title") ?? ""} ${val("property_type") ?? ""} ${val("asset_type") ?? ""}`);
        if (vehicle) warnings.push("Vehicle rule: this looks like a vehicle, which is never imported.");
        const dup = vehicle ? null : await duplicateOf(val("title"), num(val("reserve_price")));
        if (dup) warnings.push(`Possible duplicate of a live property: "${dup}".`);
        if (!val("title") && !val("full_address")) throw new Failed("The AI found no property in the collected pages.");
        return { fields, warnings, vehicle, duplicateOf: dup };
      },
      (p) => `${p.fields.filter((f) => f.value).length} field(s) validated, ${p.warnings.length} warning(s) (read-only check against live properties)`,
    );

    result.property = prop;
    const complete = prop.fields.filter((f) => f.value).length;
    result.counts = {
      ...result.counts,
      complete,
      missing: prop.fields.length - complete,
      documents: documents.length,
      images: images.length,
      sourcePages: result.collection.pages.filter((p) => p.status === "COLLECTED").length || pageSources.length,
      propertiesExtracted: 1,
    };
    steps.push({ state: "REVIEW", outcome: "done", ms: 0, note: "One property ready for review. Demo mode: there is no import button and nothing is written." });
    result.status = "COMPLETED";
  } catch (e) {
    result.status = e instanceof Refused ? "REFUSED" : "FAILED";
    result.reason = e instanceof Error ? e.message : String(e);
  }
  result.limits.requestsMade = crawler?.requests ?? result.limits.requestsMade;
  result.durationMs = Date.now() - t0;
  return result;
}
