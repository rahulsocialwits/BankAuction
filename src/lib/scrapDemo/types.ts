// AI Python Scrap — DEMO. Everything here lives in memory for one request: nothing is saved and nothing touches production data.

export type DemoSourceType = "sample" | "url" | "paste";
export type DemoStatus = "COMPLETED" | "REFUSED" | "FAILED";
export type StepState = "QUEUED" | "COLLECTING" | "NORMALIZING" | "EXTRACTING" | "VALIDATING" | "REVIEW";

export interface DemoStep {
  state: StepState;
  outcome: "done" | "skipped" | "failed" | "refused";
  ms: number;
  note?: string;
}

export interface DemoRecord {
  demoId: string;
  bank: string | null;
  title: string | null;
  type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  reservePrice: number | null;
  emd: number | null;
  auctionDate: string | null;
  inspectionDate: string | null;
  source: string;
  sourceUrl: string | null;
  externalRef: string | null;
  extractionStatus: "OK" | "INCOMPLETE" | "REJECTED";
  missing: string[];
  duplicateOf: string | null; // title of a live property that looks the same (read-only lookup)
  rejectedReason: string | null;
}

export interface DemoAccess {
  host: string | null;
  denyListMatch: string | null; // demo deny-list entry that matched (the list is empty in the demo)
  robots: "allowed" | "disallowed" | "unreachable" | null;
  httpStatus: number | null;
  collection: "NOT STARTED" | "COLLECTED" | "REFUSED" | "FAILED" | "n/a (not a URL source)";
}

export interface DemoResult {
  status: DemoStatus;
  reason: string | null;
  durationMs: number;
  source: { name: string; type: DemoSourceType; url: string | null };
  steps: DemoStep[];
  access: DemoAccess;
  collected: { items: number; chars: number; lines: number; httpStatus: number | null; contentType: string | null; preview: string };
  extraction: { mode: "AI" | "MOCK" | "NONE"; model: string | null; tokens: number | null };
  counts: { extracted: number; ok: number; incomplete: number; rejected: number; duplicates: number };
  records: DemoRecord[];
}
