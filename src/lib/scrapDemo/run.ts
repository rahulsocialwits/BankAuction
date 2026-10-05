import { prisma } from "@/lib/db/prisma";
import { MOCK_FIELDS, SAMPLE_NOTICE } from "./sample";
import { FIELDS, REQUIRED_KEYS } from "./fields";
import { extractProperty, verify, type SourceText } from "./extract";
import { Crawler, Failed, Refused } from "./crawl";
import { BrowserRenderer } from "./browser";
import { PageLoader, VEHICLE, explain, scanSite, selectProperty, type ScanOutput } from "./scan";
import { deepScan, type DeepOutput } from "./deep";
import { guessKind } from "./detect";
import { DEFAULT_SETTINGS, type ScanSettings } from "./settings";
import type { CandidateDiag, DemoResult, DemoSourceType, DemoStep, FieldValue, StepState } from "./types";

/*
 * AI Python Scrap — DEMO (isolated): scans a permitted public website, finds ONE property, collects it in depth.
 * Read-only use of existing code: the Relay client + AI rules (via extract.ts) and a read-only Property lookup for the
 * duplicate warning. Nothing is written anywhere.
 */

const MAX_TEXT = 200_000;

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

export interface DemoInput {
  name: string;
  type: DemoSourceType;
  url: string;
  urls: string; // "diagnose" mode: one address per line
  pasted: string;
  mock: boolean;
  settings: ScanSettings;
}

export async function runDemo(input: DemoInput): Promise<DemoResult> {
  const t0 = Date.now();
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const steps: DemoStep[] = [];
  const startUrl = input.type === "url" ? input.url.trim() : input.type === "diagnose" ? input.urls.split(/\s+/).find(Boolean) ?? null : null;
  const result: DemoResult = {
    status: "FAILED",
    reason: null,
    durationMs: 0,
    source: { name: input.name || "Demo source", type: input.type, url: startUrl },
    settings,
    steps,
    access: { host: null, denyListMatch: null, robots: null, httpStatus: null, collection: input.type === "url" || input.type === "diagnose" ? "NOT STARTED" : "n/a (not a URL source)" },
    limits: { requestsMade: 0 },
    scan: {
      startUrl, domain: null, pagesDiscovered: 0, pagesScanned: 0, pagesSkipped: 0, pagesRefused: 0, pagesFailed: 0, propertyCandidates: 0, candidatesChecked: 0, listingPages: 0, paginationPages: 0,
      documentsFound: 0, imagesFound: 0, sitemapUrls: 0, sitemapNote: "—", browser: { requested: settings.useBrowser, used: 0, status: "not needed so far" },
    },
    pages: [],
    candidates: [],
    discovery: { path: [], selected: null },
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
  let loader: PageLoader | null = null;
  const renderer = new BrowserRenderer();
  try {
    steps.push({ state: "QUEUED", outcome: "done", ms: 0, note: "Demo run created in memory (nothing is stored)" });

    let sources: SourceText[] = [];
    let deep: DeepOutput | null = null;
    let detail: { url: string; html: string; text: string } | null = null;

    if (input.type === "url" || input.type === "diagnose") {
      if (!startUrl) throw new Failed("Enter a website address.");
      let start: URL;
      try { start = new URL(startUrl); } catch { throw new Failed("Not a valid web address. Use a full https:// address."); }
      if (start.protocol !== "https:") throw new Failed("Only https addresses are used in the demo.");
      result.access.host = start.hostname;
      const listed = DEMO_DENY_LIST.find((h) => start.hostname === h || start.hostname.endsWith("." + h));
      result.access.denyListMatch = listed ?? null;
      if (listed) throw new Refused(`demo deny-list: "${start.hostname}" matches "${listed}". No request was sent.`);
      result.scan.domain = start.hostname;

      crawler = new Crawler(startUrl, settings.maxPages + settings.maxDeepPages + 40, t0 + settings.timeLimitSec * 1000);
      loader = new PageLoader(crawler, renderer, settings);
      const L = loader;

      // ---- Diagnose mode: a few given addresses, each measured and explained ---------------------------------------
      if (input.type === "diagnose") {
        const list = [...new Set(input.urls.split(/\s+/).filter(Boolean))].slice(0, 8);
        const diag: CandidateDiag[] = [];
        await step(
          "SITE SCANNING",
          async () => {
            for (const u of list) {
              let uu: URL;
              try { uu = new URL(u); } catch { diag.push(failDiag(u, false, "not a valid address")); continue; }
              if (!crawler!.sameSite(uu.toString())) { diag.push(failDiag(u, false, `outside the site (${uu.hostname}); one domain per diagnosis`)); continue; }
              const r = await L.load(u, { depth: 1, kind: guessKind({ url: u, text: "" }), phase: "scan", allowRender: true });
              if (!r.ok) { diag.push(failDiag(u, r.refused, r.reason)); continue; }
              diag.push(diagFromLoad(u, r));
            }
            return diag.length;
          },
          (n) => `${n} address(es) measured, ${L.browserUsed} rendered in a browser`,
        );
        result.candidates = diag;
        result.pages = L.rows;
        result.scan.browser = { requested: settings.useBrowser, used: L.browserUsed, status: L.browserStatus };
        result.scan.pagesScanned = L.rows.filter((r) => r.mode === "HTTP" || r.mode === "BROWSER").length;
        result.scan.pagesRefused = L.rows.filter((r) => r.mode === "REFUSED").length;
        result.scan.pagesFailed = L.rows.filter((r) => r.mode === "FAILED").length;
        result.access.robots = "allowed";
        result.access.collection = result.scan.pagesScanned ? "COLLECTED" : "FAILED";
        result.limits.requestsMade = crawler.requests;
        steps.push({ state: "REVIEW", outcome: "done", ms: 0, note: "Diagnosis only: no property is extracted in this mode." });
        result.status = "COMPLETED";
        return finish(result, t0, renderer, crawler, loader);
      }

      // ---- 1) SITE SCANNING ---------------------------------------------------------------------------------------
      let scan: ScanOutput;
      try {
        scan = await step("SITE SCANNING", () => scanSite(startUrl, settings, L), (s) => `${s.summary.pagesScanned} page(s) scanned, ${s.summary.pagesDiscovered} address(es) discovered (stopped: ${s.stopReason})`);
      } catch (e) {
        const first = L.rows[0];
        result.access.robots = e instanceof Error && /robots\.txt/i.test(e.message) ? (e instanceof Refused ? "disallowed" : "unreachable") : first ? "allowed" : null;
        result.access.httpStatus = first?.httpStatus ?? null;
        result.access.collection = e instanceof Refused ? "REFUSED" : "FAILED";
        throw e;
      }
      const first = L.rows.find((r) => r.depth === 0);
      result.access.robots = "allowed";
      result.access.httpStatus = first?.httpStatus ?? null;
      result.access.collection = "COLLECTED";
      result.scan = scan.summary;
      steps.push({ state: "DISCOVERING", outcome: "done", ms: 0, note: `Sitemap: ${scan.summary.sitemapNote}. ${scan.summary.listingPages} listing page(s), ${scan.summary.paginationPages} pagination page(s), ${scan.summary.documentsFound} document link(s), ${scan.summary.imagesFound} image(s) seen.` });
      steps.push({ state: "PROPERTY CANDIDATES", outcome: "done", ms: 0, note: `${scan.summary.propertyCandidates} property/auction link(s) found; ${scan.summary.candidatesChecked} fetched and scored.` });
      result.counts.propertiesDiscovered = scan.summary.propertyCandidates;

      // ---- 2) SELECTING exactly ONE property -------------------------------------------------------------------------
      const sel = selectProperty(scan);
      for (const row of L.rows.filter((r) => (r.kind === "PROPERTY" || r.kind === "AUCTION") && (r.mode === "REFUSED" || r.mode === "FAILED"))) {
        sel.diag.push(failDiag(row.url, row.mode === "REFUSED", row.reason));
      }
      result.candidates = sel.diag;
      result.pages = L.rows;
      const chosen = await step(
        "SELECTING",
        () => {
          if (!sel.chosen) {
            const best = [...scan.kept].sort((a, b) => b.load.det.score - a.load.det.score)[0];
            throw new Failed(
              `No property page could be confirmed (${scan.summary.candidatesChecked} candidate page(s) fetched and scored). ` +
                (best ? `Best candidate: ${best.url} — score ${best.load.det.score}. ${explain(best.load)} ` : "") +
                `Browser renderer: ${L.browserStatus}. See "Candidate diagnostics" and "Scan Debug" below.`,
            );
          }
          return sel.chosen;
        },
        (c) => `Selected 1 of ${scan.summary.propertyCandidates} candidate(s): score ${c.load.det.score} (${c.load.det.label})${sel.why ? `. ${sel.why}` : ""}`,
      );
      result.discovery = { path: [...scan.path.slice(0, -1), "Property detail"], selected: { title: chosen.load.stats.h1 ?? chosen.load.stats.title, url: chosen.url, score: chosen.load.det.score, label: chosen.load.det.label } };
      result.counts.propertiesSelected = 1;

      // ---- 3) DEEP SCANNING that property only -----------------------------------------------------------------------
      deep = await step(
        "DEEP SCANNING",
        () => deepScan(chosen, L, startUrl),
        (d) => `${d.pages.length} page(s) of this property, ${d.relatedCount} related, ${d.documents.length} document reference(s), ${d.images.length} image reference(s), ${d.refused.length} refused`,
      );
      sources = deep.sources;
      detail = deep.detail;
      result.collection = { pages: deep.pages, documents: deep.documents, images: deep.images, links: deep.links, refused: deep.refused };
      result.raw = { html: deep.detail.html.slice(0, 60_000), text: deep.detail.text.slice(0, 60_000), jsonLd: deep.jsonLd, truncated: deep.detail.html.length > 60_000 || deep.detail.text.length > 60_000 };
    } else {
      // Sample or pasted text: it is the property page; no website to scan.
      const text = input.type === "sample" ? SAMPLE_NOTICE : input.pasted.slice(0, MAX_TEXT);
      steps.push({ state: "SITE SCANNING", outcome: "skipped", ms: 0, note: "Not a website: nothing to scan" });
      steps.push({ state: "PROPERTY CANDIDATES", outcome: "skipped", ms: 0, note: "The first property described in the text is used" });
      await step("COLLECTING", () => (text.trim().length < 40 ? Promise.reject(new Failed("Paste the notice text first (at least a few lines).")) : true), () => `${text.length.toLocaleString("en-IN")} characters (${input.type === "sample" ? "built-in sample" : "pasted"})`);
      detail = { url: "", html: text, text };
      sources = [{ id: "S1", label: input.type === "sample" ? "Built-in sample notice" : "Pasted notice text", text: text.slice(0, 30_000) }];
      result.counts.propertiesDiscovered = 1;
      result.counts.propertiesSelected = 1;
      result.discovery = { path: [input.type === "sample" ? "Sample notice" : "Pasted text"], selected: null };
      result.raw = { html: text.slice(0, 60_000), text: text.slice(0, 60_000), jsonLd: [], truncated: text.length > 60_000 };
    }

    result.limits.requestsMade = crawler?.requests ?? 0;
    const d = detail!;
    await step("NORMALIZING", () => (d.text.trim().length < 40 ? Promise.reject(new Failed("Almost no readable text was found on the property page.")) : true), () => `Source package: ${sources.length} text block(s), ${sources.reduce((n, s) => n + s.text.length, 0).toLocaleString("en-IN")} characters for the AI; raw HTML kept separately (${d.html.length.toLocaleString("en-IN")} characters)`);

    // ---- 4) EXTRACTING: ONE property through the existing Relay client -------------------------------------------
    const ex = await step(
      "EXTRACTING",
      async () => {
        if (input.mock && input.type === "sample") {
          return { fields: Object.fromEntries(Object.entries(MOCK_FIELDS).map(([k, v]) => [k, { value: v, source: "S1" }])), vehicle: false, model: null as string | null, tokens: null as number | null, mode: "MOCK" as const };
        }
        const e = await extractProperty(sources);
        return { ...e, mode: "AI" as const };
      },
      (e) => `${Object.keys(e.fields).length} field(s) found via ${e.mode === "AI" ? "the existing Relay extraction" : "MOCK sample response"}${e.vehicle ? " (vehicle)" : ""}`,
    );
    result.extraction = { mode: ex.mode, model: ex.model, tokens: ex.tokens };

    // ---- 5) VALIDATING ---------------------------------------------------------------------------------------------
    const geo = deep?.geo ?? { mapUrl: null, lat: null, lng: null };
    const prop = await step(
      "VALIDATING",
      async () => {
        const textOf = new Map(sources.map((s) => [s.id, s.text]));
        const labelOf = new Map(sources.map((s) => [s.id, s.label]));
        const warnings: string[] = [];
        const fields: FieldValue[] = FIELDS.map((def) => {
          const got = ex.fields[def.key];
          const value = got?.value ?? null;
          const src = got?.source && textOf.has(got.source) ? got.source : value ? "S1" : null;
          const ok = value && src ? verify(def, value, textOf.get(src) ?? "") || verify(def, value, [...textOf.values()].join("\n")) : null;
          if (value && ok === false) warnings.push(`${def.label}: the value was not found word-for-word in the source (check it before trusting it).`);
          if (value && def.kind === "money" && !num(value)) warnings.push(`${def.label}: price format not recognised ("${value.slice(0, 30)}").`);
          if (value && def.kind === "date" && !dateOk(value)) warnings.push(`${def.label}: date format not recognised ("${value.slice(0, 30)}").`);
          return { key: def.key, label: def.label, group: def.group, value, source: src ? `${src} — ${labelOf.get(src) ?? ""}`.trim() : null, verified: ok };
        });
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
      documents: result.collection.documents.length,
      images: result.collection.images.length,
      sourcePages: result.collection.pages.filter((p) => p.status === "COLLECTED").length || sources.length,
      propertiesExtracted: 1,
    };
    steps.push({ state: "REVIEW", outcome: "done", ms: 0, note: "One property ready for review. Demo mode: there is no import button and nothing is written." });
    result.status = "COMPLETED";
  } catch (e) {
    result.status = e instanceof Refused ? "REFUSED" : "FAILED";
    result.reason = e instanceof Error ? e.message : String(e);
  }
  return finish(result, t0, renderer, crawler, loader);
}

async function finish(result: DemoResult, t0: number, renderer: BrowserRenderer, crawler: Crawler | null, loader: PageLoader | null): Promise<DemoResult> {
  await renderer.close();
  if (loader) {
    result.pages = loader.rows;
    result.scan.browser = { requested: result.settings.useBrowser, used: loader.browserUsed, status: loader.browserStatus };
  }
  result.limits.requestsMade = crawler?.requests ?? result.limits.requestsMade;
  result.durationMs = Date.now() - t0;
  return result;
}

function failDiag(url: string, refused: boolean, reason: string): CandidateDiag {
  return {
    diagnostics: null,
    url,
    kind: (() => { try { return guessKind({ url, text: "" }); } catch { return "OTHER" as const; } })(),
    httpStatus: null,
    rendered: false,
    jsShell: false,
    textChars: 0,
    score: null,
    label: null,
    signalsFound: 0,
    signalsTotal: 14,
    signals: [],
    title: null,
    propertyId: null,
    reserve: null,
    auctionDate: null,
    verdict: "REJECTED",
    reason: `${refused ? "REFUSED" : "FAILED"} — ${reason}`,
  };
}

function diagFromLoad(url: string, l: import("./scan").LoadOk): CandidateDiag {
  return {
    diagnostics: l.diagnostics,
    url,
    kind: guessKind({ url, text: "" }),
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
    verdict: l.det.score >= 51 ? "ACCEPTED" : "REJECTED",
    reason: `${l.det.score >= 51 ? "ACCEPTED as a property page. " : "REJECTED: below the property threshold (51). "}${explain(l)}`,
  };
}
