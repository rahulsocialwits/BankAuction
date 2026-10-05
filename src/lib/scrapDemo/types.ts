// AI Python Scrap — DEMO. Everything lives in memory for one request: nothing is saved and nothing touches production data.

import type { ScanSettings } from "./settings";

export type DemoSourceType = "sample" | "url" | "paste" | "diagnose";
export type DemoStatus = "COMPLETED" | "REFUSED" | "FAILED";
export type StepState = "QUEUED" | "SITE SCANNING" | "DISCOVERING" | "PROPERTY CANDIDATES" | "SELECTING" | "DEEP SCANNING" | "COLLECTING" | "NORMALIZING" | "EXTRACTING" | "VALIDATING" | "REVIEW";

export interface DemoStep {
  state: StepState;
  outcome: "done" | "skipped" | "failed" | "refused";
  ms: number;
  note?: string;
}

export interface DemoAccess {
  host: string | null;
  denyListMatch: string | null; // demo deny-list entry that matched (the list is empty in the demo)
  robots: "allowed" | "disallowed" | "unreachable" | null;
  httpStatus: number | null; // status of the first (start) page
  collection: "NOT STARTED" | "COLLECTED" | "REFUSED" | "FAILED" | "n/a (not a URL source)";
}

export type PageKind = "HOME" | "NAVIGATION" | "SEARCH" | "LISTING" | "PAGINATION" | "PROPERTY" | "AUCTION" | "NOTICE" | "DOCUMENT" | "IMAGE" | "LOCATION" | "OTHER";

/** One row of the "Scan Debug" table. */
export interface PageDebug {
  phase: "scan" | "deep";
  url: string;
  depth: number;
  kind: PageKind;
  httpStatus: number | null;
  mode: "HTTP" | "BROWSER" | "REFUSED" | "FAILED";
  ms: number;
  links: number;
  textChars: number;
  scripts: number;
  jsShell: boolean;
  score: number | null; // property detection score 0-100
  label: string | null; // NOT PROPERTY / POSSIBLE / STRONG / CONFIRMED
  reason: string;
}

export interface ScanSummary {
  startUrl: string | null;
  domain: string | null;
  pagesDiscovered: number;
  pagesScanned: number;
  pagesSkipped: number;
  pagesRefused: number;
  pagesFailed: number;
  propertyCandidates: number; // links that look like a property/auction page (verified or not)
  candidatesChecked: number; // of those, pages actually fetched and scored
  listingPages: number;
  paginationPages: number;
  documentsFound: number;
  imagesFound: number;
  sitemapUrls: number;
  sitemapNote: string;
  browser: { requested: boolean; used: number; status: string };
}

/** A link that looks like a property/auction page (used by the URL scoring in crawl.ts). */
export interface Candidate {
  url: string;
  text: string;
  score: number;
}

export type PageState = "STATIC_CONTENT" | "JS_SHELL" | "PROPERTY_PAGE" | "UNKNOWN" | "REFUSED";

/** Everything measured about one fetched page, so "why was it (not) accepted?" is never a guess. */
export interface PageDiagnostics {
  finalUrl: string;
  contentType: string;
  redirects: number;
  htmlChars: number; // plain HTTP response
  httpTextChars: number; // visible text in the plain HTTP response
  renderedTextChars: number | null; // visible text after browser rendering (null when it was not rendered)
  title: string | null;
  h1: string | null;
  h2Count: number;
  scripts: number;
  links: number;
  images: number;
  jsonLdCount: number;
  keywords: { property: number; auction: number; bank: number; reserve: number; emd: number; date: number; address: number };
  renderMode: "HTTP_HTML" | "BROWSER_RENDER" | "FAILED";
  pageState: PageState;
  shellWhy: string;
}

/** Why a candidate property page was accepted or rejected (the debug view the Baanknet test needs). */
export interface CandidateDiag {
  diagnostics: PageDiagnostics | null;
  url: string;
  kind: PageKind;
  httpStatus: number | null;
  rendered: boolean; // true when the browser renderer produced the content
  jsShell: boolean; // the plain HTML was an empty application shell
  textChars: number;
  score: number | null;
  label: string | null;
  signalsFound: number;
  signalsTotal: number;
  signals: string[];
  title: string | null;
  propertyId: string | null;
  reserve: string | null;
  auctionDate: string | null;
  verdict: "ACCEPTED" | "REJECTED" | "NOT FETCHED";
  reason: string;
}

export interface PageRef {
  url: string;
  label: string; // e.g. "Property detail page", "Related page"
  status: "COLLECTED" | "REFUSED" | "FAILED";
  httpStatus: number | null;
  chars: number;
  note?: string;
}

export interface DocRef {
  title: string;
  url: string;
  type: string; // Sale Notice, Terms, Brochure, PDF …
  mime: string | null;
  sizeBytes: number | null;
  date: string | null;
  sourcePage: string;
  check: "listed only" | "reachable" | "REFUSED" | "unreachable";
}

export interface ImageRef {
  url: string;
  sourcePage: string;
  alt: string | null;
  title: string | null;
  kind: string | null; // og:image, img, srcset …
}

export interface LinkRef {
  kind: "Property detail" | "Official source" | "Auction" | "Bank notice" | "Document" | "Image" | "Inspection" | "Map";
  url: string;
}

export interface FieldValue {
  key: string;
  label: string;
  group: string;
  value: string | null;
  source: string | null; // where in the collected package the value came from
  verified: boolean | null; // true when the value really appears in the source text; null when there is no value
}

export interface DemoResult {
  status: DemoStatus;
  reason: string | null;
  durationMs: number;
  source: { name: string; type: DemoSourceType; url: string | null };
  settings: ScanSettings;
  steps: DemoStep[];
  access: DemoAccess;
  limits: { requestsMade: number };
  scan: ScanSummary;
  pages: PageDebug[]; // every page the scan and the deep scan touched
  candidates: CandidateDiag[]; // the best candidates, with the reason each was accepted or rejected
  discovery: {
    path: string[]; // e.g. Start page → Listing page → Property detail
    selected: { title: string | null; url: string | null; score: number | null; label: string | null } | null;
  };
  collection: {
    pages: PageRef[]; // the selected property's own pages
    documents: DocRef[];
    images: ImageRef[];
    links: LinkRef[];
    refused: { url: string; reason: string }[];
  };
  extraction: { mode: "AI" | "MOCK" | "NONE"; model: string | null; tokens: number | null };
  property: {
    fields: FieldValue[];
    duplicateOf: string | null;
    warnings: string[];
    vehicle: boolean;
  } | null;
  counts: { complete: number; missing: number; documents: number; images: number; sourcePages: number; propertiesDiscovered: number; propertiesSelected: number; propertiesExtracted: number };
  raw: { html: string; text: string; jsonLd: string[]; truncated: boolean };
}
