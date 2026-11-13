import { createHash } from "node:crypto";
import type { ListingRecord } from "@/lib/import/csvImport";
import { pagesAuthorization } from "./import";
import { parseEauctionsPage } from "./parse";
import { parseEauctionsDetail, type EauctionsDetail } from "./parseDetail";
import { pageSaysMaharashtra, unwrapViewSource } from "./maharashtra";
import { runExportImport, type Batches, type Reconciliation } from "./exportImport";

/*
 * ONE pipeline from eAuctionsIndia Maharashtra PAGES to BankAuction, for pages that are already in hand: hand-saved list / detail pages and the staging
 * files written by the live crawler (sliceCrawl). Reuses the parsers, the batch / checkpoint / retry runner of exportImport.ts and (in the script)
 * `importRecords`. A detail page enriches its listing: its values win, and only fields the detail page leaves empty are filled from the list card.
 * Nothing is invented; a field that no page contains stays empty and is counted as missing.
 *
 * Write gate (every item): --confirm-import, EAUCTIONS_AUTHORIZED=yes, EAUCTIONS_AUTH_NOTE, and the scope flag of where the pages came from:
 *   EAUCTIONS_SCOPE_LOCAL_FILE=yes   hand-saved pages        EAUCTIONS_SCOPE_AUTOMATED=yes   pages fetched by the crawler
 * Set a scope flag only after the operator's written permission, which must cover that use, has been read.
 */

export interface SourceFile { name: string; html: string }
export type FileKind = "list" | "detail" | "not_maharashtra" | "layout_changed" | "unreadable";
export interface FileDiag { name: string; kind: FileKind; cards: number; rejected: number; errors: string[]; headlineTotal: number | null; lastPage: number | null }

/** Detail-page fields that make a listing "fully detailed". An empty one is reported, never filled in. */
export const DETAIL_FIELDS: Array<[string, string]> = [["emd", "EMD"], ["auction_end", "auction end"], ["application_deadline", "application deadline"], ["borrower", "borrower"], ["branch", "branch"], ["description", "description"], ["documents", "sale notice"]];

export interface Collected {
  /** merged, de-duplicated records keyed by src:eauctionsindia.com:<id> */
  records: Map<string, ListingRecord>;
  hasDetail: Set<string>;
  files: FileDiag[];
  cardsParsed: number;
  rejectedCards: number;
  duplicatesAcrossFiles: number;
  /** the site's own headline numbers as read from the pages: source-reported, never imported counts */
  headlineTotals: number[];
}

const classify = (html: string): "detail" | "list" => (/<link[^>]+rel=["']canonical["'][^>]+\/properties\/\d+/i.test(html) && /Auction ID\s*:?\s*#/i.test(html) ? "detail" : "list");

export function collectFromHtml(files: SourceFile[], extra?: { listRecords?: ListingRecord[]; detailRecords?: ListingRecord[] }): Collected {
  const lists = new Map<string, ListingRecord>();
  const details = new Map<string, ListingRecord>();
  const diags: FileDiag[] = [];
  let cards = 0, rejected = 0, dups = 0;
  const heads: number[] = [];
  const addList = (r: ListingRecord) => { const k = String(r.external_id); if (lists.has(k)) { dups++; return; } lists.set(k, r); };

  for (const f of files) {
    const html = unwrapViewSource(f.html);
    const d: FileDiag = { name: f.name, kind: "unreadable", cards: 0, rejected: 0, errors: [], headlineTotal: null, lastPage: null };
    diags.push(d);
    if (!html.trim()) { d.errors.push("empty file"); continue; }
    if (classify(html) === "detail") {
      const det: EauctionsDetail = parseEauctionsDetail(html);
      if (!det.ok || !det.record) { d.errors.push(...det.errors); continue; }
      if (det.state.toLowerCase() !== "maharashtra") { d.kind = "not_maharashtra"; d.errors.push(`state "${det.state || "(none)"}" is not Maharashtra`); continue; }
      const k = String(det.record.external_id);
      d.kind = "detail"; d.cards = 1;
      if (details.has(k)) dups++; else details.set(k, { ...det.record, geo_state: "Maharashtra" });
      continue;
    }
    const page = parseEauctionsPage(html, "");
    d.headlineTotal = page.headlineTotal; d.lastPage = page.lastPage; d.rejected = page.rejected;
    rejected += page.rejected;
    if (page.headlineTotal) heads.push(page.headlineTotal);
    if (!pageSaysMaharashtra(html)) { d.kind = "not_maharashtra"; d.errors.push("the page does not name Maharashtra"); continue; }
    if (!page.records.length) { d.kind = "layout_changed"; d.errors.push("no listing card could be read (layout changed, or not a listing page)"); continue; }
    d.kind = "list"; d.cards = page.records.length; cards += page.records.length;
    for (const r of page.records) addList({ ...r, geo_state: "Maharashtra" });
  }
  for (const r of extra?.listRecords ?? []) { cards++; addList({ ...r, geo_state: "Maharashtra" }); }
  for (const r of extra?.detailRecords ?? []) { const k = String(r.external_id); if (!details.has(k)) details.set(k, { ...r, geo_state: "Maharashtra" }); }

  const records = new Map<string, ListingRecord>();
  const hasDetail = new Set<string>();
  for (const k of new Set([...lists.keys(), ...details.keys()])) {
    const l = lists.get(k);
    const d = details.get(k);
    if (d) {
      hasDetail.add(k);
      const merged: ListingRecord = { ...d };
      for (const [key, val] of Object.entries(l ?? {})) if (!merged[key] && val) merged[key] = val; // fill ONLY what the detail page left empty
      records.set(k, merged);
    } else records.set(k, l!);
  }
  return { records, hasDetail, files: diags, cardsParsed: cards, rejectedCards: rejected, duplicatesAcrossFiles: dups, headlineTotals: heads };
}

export interface Enrichment { listings: number; withDetail: number; withoutDetail: number; missing: Record<string, number>; coveragePct: number }

export function enrichmentCoverage(c: Collected): Enrichment {
  const missing: Record<string, number> = {};
  for (const k of c.hasDetail) {
    const r = c.records.get(k)!;
    for (const [field, label] of DETAIL_FIELDS) if (!r[field]) missing[label] = (missing[label] ?? 0) + 1;
  }
  const n = c.records.size;
  return { listings: n, withDetail: c.hasDetail.size, withoutDetail: n - c.hasDetail.size, missing, coveragePct: n ? Math.round((c.hasDetail.size / n) * 1000) / 10 : 0 };
}

export function bulkWriteAllowed(env: Record<string, string | undefined>, confirm: boolean, origin: "saved_pages" | "crawled"): { ok: true } | { ok: false; reason: string } {
  if (!confirm) return { ok: false, reason: "Dry run: nothing is written without --confirm-import." };
  const a = pagesAuthorization(env);
  if (!a.ok) return { ok: false, reason: a.reason };
  const flag = origin === "saved_pages" ? "EAUCTIONS_SCOPE_LOCAL_FILE" : "EAUCTIONS_SCOPE_AUTOMATED";
  if (env[flag]?.trim() !== "yes") return { ok: false, reason: `Import is disabled: ${flag} is not "yes". Set it only after the operator's written permission, covering ${origin === "saved_pages" ? "pages saved by hand" : "automated collection"}, has been read.` };
  return { ok: true };
}

export interface BulkReport {
  generatedAt: string;
  mode: "dry" | "import";
  files: FileDiag[];
  pagesFromCrawler: { fetched: number; blocked: number; failed: number; layoutChanged: number } | null;
  cardsParsed: number;
  uniqueListings: number;
  rejectedCards: number;
  duplicatesAcrossFiles: number;
  enrichment: Enrichment;
  sourceReportedHeadlineTotals: number[];
  reconciliation: Reconciliation;
  databaseVerifiedStored: number | null;
  /** institution / Maharashtra gates: counts and every excluded listing with its reason */
  qualification?: unknown;
  note: string;
}

/** What "already imported" means for resume: the id plus a digest of the record's content, so a listing that later gets a detail page is sent again (and enriched). */
export const doneSig = (r: ListingRecord) => `${r.external_id}|${createHash("sha1").update(JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] ?? ""]))).digest("hex").slice(0, 12)}`;

export async function runBulk(o: {
  collected: Collected;
  mode: "dry" | "import";
  batchSize?: number;
  maxBatches?: number;
  /** signatures (doneSig) already imported by earlier runs: resume skips them */
  done?: Set<string>;
  saveDone?: (done: Set<string>) => Promise<void>;
  importBatch?: (r: ListingRecord[]) => Promise<{ created: number; updated: number; skipped: number; failed: number }>;
  existingKeys?: (keys: string[]) => Promise<string[]>;
  sleep?: (ms: number) => Promise<void>;
  log?: (l: string) => void;
}): Promise<{ reconciliation: Reconciliation; enrichment: Enrichment; alreadyDone: number; pending: number }> {
  const c = o.collected;
  const all = [...c.records.values()].sort((x, y) => String(x.external_id).localeCompare(String(y.external_id), "en", { numeric: true }));
  const done = o.done ?? new Set<string>();
  const pending = o.mode === "import" ? all.filter((r) => !done.has(doneSig(r))) : all;
  const alreadyDone = all.length - pending.length;
  const batch: Batches = { valid: pending, invalid: [], excluded: 0, duplicates: Array.from({ length: c.duplicatesAcrossFiles }, (_, i) => ({ index: i, key: "" })), warnings: {} };
  const wrapped = o.importBatch
    ? async (slice: ListingRecord[]) => {
        const res = await o.importBatch!(slice);
        if (res.failed === 0) { for (const r of slice) done.add(doneSig(r)); await o.saveDone?.(done); } // saved after every batch that went through whole
        return res;
      }
    : undefined;
  const reconciliation = await runExportImport({
    batch, rowsRead: c.cardsParsed + c.files.filter((f) => f.kind === "detail").length, declaredTotal: null, hash: "bulk", mode: o.mode, batchSize: o.batchSize ?? 100, maxBatches: o.maxBatches, restart: true,
    importBatch: wrapped, existingKeys: o.existingKeys, sleep: o.sleep, log: o.log,
  });
  reconciliation.fileCoverageVerified = false; // a headline total is never coverage; only a verified database count says what is stored
  return { reconciliation, enrichment: enrichmentCoverage(c), alreadyDone, pending: pending.length };
}
