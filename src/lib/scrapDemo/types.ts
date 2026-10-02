// AI Python Scrap — DEMO. Everything lives in memory for one request: nothing is saved and nothing touches production data.

export type DemoSourceType = "sample" | "url" | "paste";
export type DemoStatus = "COMPLETED" | "REFUSED" | "FAILED";
export type StepState = "QUEUED" | "DISCOVERING" | "SELECTING" | "COLLECTING" | "NORMALIZING" | "EXTRACTING" | "VALIDATING" | "REVIEW";

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

export interface PageRef {
  url: string;
  label: string; // e.g. "Start page", "Listing page", "Property detail page", "Related page"
  status: "COLLECTED" | "REFUSED" | "FAILED";
  httpStatus: number | null;
  chars: number;
  note?: string;
}

export interface Candidate {
  url: string;
  text: string;
  score: number;
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
  steps: DemoStep[];
  access: DemoAccess;
  limits: { maxPages: number; maxDepth: number; sameDomainOnly: true; requestsMade: number };
  discovery: {
    startUrl: string | null;
    pagesInspected: number;
    linksSeen: number;
    candidates: Candidate[]; // top candidate property links
    candidateTotal: number;
    path: string[]; // e.g. Homepage → Listing page → Property detail
    selected: { title: string | null; url: string | null } | null;
  };
  collection: {
    pages: PageRef[];
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
