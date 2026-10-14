import { createHash } from "node:crypto";
import { parseCsv, type ListingRecord } from "@/lib/import/csvImport";
import { cleanDate, cleanMoney, makeMapper, normalizePropertyType, type FieldMap } from "@/data-sources/authorized/fieldMap";
import { getPath } from "@/data-sources/authorized/jsonFeed";
import { pagesAuthorization } from "./import";
import { EAUCTIONS_HOST } from "./parse";

/*
 * Bulk ingestion of an OFFICIALLY AUTHORIZED eAuctionsIndia export (a CSV or JSON file the operator supplied in writing, or a saved API answer).
 * It reads a FILE: it never contacts the website, so Cloudflare, robots.txt and login controls are not involved and nothing is bypassed.
 * (A live feed or API goes through src/data-sources/authorized/eauctionsindia.ts, the existing JSON-feed path with the same safeguards.)
 *
 * The export's column names are NOT known, so none are assumed: the person who has the operator's export specification supplies a field map
 * (listing key -> column name or dot path). Nothing is invented: an empty cell stays empty; a record without what the importer needs is reported
 * as invalid with the reason. Writing needs ALL of: --confirm-import, EAUCTIONS_AUTHORIZED=yes, EAUCTIONS_AUTH_NOTE, EAUCTIONS_SCOPE_EXPORT=yes
 * (set only after the operator's written permission has been read and covers this export). Default is a dry run that writes nothing.
 */

export type ExportMap = FieldMap & { auctionType?: string; documents?: string; status?: string };

export interface ReadExport { rows: Record<string, unknown>[]; declaredTotal: number | null; format: "csv" | "json" }

/** CSV or JSON text -> rows. JSON may be an array or an object holding the array (records / data / items / results / properties). */
export function readExport(text: string, fileName: string): ReadExport | { error: string } {
  const body = text.replace(/^﻿/, "");
  if (/\.json$/i.test(fileName)) {
    let j: unknown;
    try { j = JSON.parse(body); } catch { return { error: "The JSON file is not valid JSON." }; }
    let arr: unknown = j;
    let total: number | null = null;
    if (!Array.isArray(j) && j && typeof j === "object") {
      const o = j as Record<string, unknown>;
      arr = ["records", "data", "items", "results", "properties", "listings"].map((k) => o[k]).find(Array.isArray);
      const t = [o.total, o.totalRecords, o.total_records, o.count].find((v) => typeof v === "number" && Number.isFinite(v));
      total = typeof t === "number" ? t : null;
    }
    if (!Array.isArray(arr)) return { error: "No list of records found in the JSON file." };
    return { rows: arr.filter((r) => r && typeof r === "object") as Record<string, unknown>[], declaredTotal: total, format: "json" };
  }
  if (/\.csv$/i.test(fileName)) {
    const grid = parseCsv(body).filter((r) => r.some((c) => c.trim()));
    if (grid.length < 2) return { error: "The CSV file has no data rows." };
    const head = grid[0].map((h) => h.trim());
    return { rows: grid.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()]))), declaredTotal: null, format: "csv" };
  }
  return { error: "Unsupported file type. Use .csv or .json (save an Excel sheet as CSV UTF-8): no Excel reader is installed." };
}

/**
 * A date WITHOUT a time zone (dd-mm-yyyy [hh:mm], 24-hour) is read as India time, the zone the site itself shows (confirmed on the real pages), and
 * converted to UTC. A date that carries a zone (ISO with Z or an offset) is kept as given. Unreadable -> "".
 */
export function exportDate(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return cleanDate(s);
  const [d, mo, y, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (y < 2010 || y > 2100 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || h > 23 || mi > 59) return "";
  return new Date(t.getTime() - 5.5 * 3600_000).toISOString();
}

export const exportKey = (id: string) => `src:${EAUCTIONS_HOST}:${id}`;

export interface RowResult { index: number; record: ListingRecord | null; errors: string[]; warnings: string[]; excluded: boolean }

const WARN_FIELDS: Array<[keyof ExportMap, string]> = [["bank", "bank"], ["emd", "emd"], ["auctionStart", "auction_start"], ["auctionEnd", "auction_end"], ["propertyType", "property_type"], ["pincode", "pincode"]];

/** One raw row -> a validated listing record or the reasons it is not one. Pure. */
export function normalizeRow(raw: Record<string, unknown>, map: ExportMap, index: number, onlyState = "Maharashtra"): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const val = (k: keyof ExportMap) => String(getPath(raw, map[k]) ?? "").replace(/\s+/g, " ").trim();
  const id = val("id");
  if (!id) errors.push("missing id");
  else if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) errors.push(`id "${id.slice(0, 40)}" has unexpected characters`);

  let url = val("url");
  if (url) {
    try { const u = new URL(url); if (u.protocol !== "https:" || u.hostname.replace(/^www\./, "") !== EAUCTIONS_HOST) errors.push(`source URL is not an https ${EAUCTIONS_HOST} address`); }
    catch { errors.push("source URL is not a valid URL"); }
  } else if (/^\d+$/.test(id)) url = `https://www.eauctionsindia.com/properties/${id}`; // the site's own property address pattern (seen on the real pages)
  else if (id) errors.push("missing source URL (and the id is not numeric, so the address cannot be derived)");

  const state = val("state");
  if (!state) errors.push("missing state (needed to keep Maharashtra only)");
  else if (state.toLowerCase() !== onlyState.toLowerCase()) errors.push(`state "${state}" is not ${onlyState}`);

  const price = cleanMoney(getPath(raw, map.reservePrice));
  const start = exportDate(getPath(raw, map.auctionStart));
  const end = exportDate(getPath(raw, map.auctionEnd));
  if (val("reservePrice") && !price) errors.push(`reserve price "${val("reservePrice").slice(0, 30)}" is not a valid amount`);
  if (val("auctionStart") && !start) errors.push(`auction start "${val("auctionStart").slice(0, 30)}" is not a valid date`);
  if (!price && !start) errors.push("neither a reserve price nor an auction date");
  if (!val("city") && !val("address") && !val("locality")) errors.push("no city, locality or address");

  const type = normalizePropertyType(val("propertyType"));
  if (type === "EXCLUDED") return { index, record: null, errors: ["not real estate (excluded type)"], warnings, excluded: true };

  const place = [val("locality"), val("city")].filter(Boolean).join(", ");
  const title = val("title") || (val("propertyType") && place ? `${val("propertyType")} for sale in ${place}` : "");
  if (!title) errors.push("no title (and no property type + place to build one from)");
  for (const [k, label] of WARN_FIELDS) if (map[k] && !val(k)) warnings.push(`empty ${label}`);
  if (errors.length) return { index, record: null, errors, warnings, excluded: false };

  const mapped = makeMapper(EAUCTIONS_HOST, { ...map, id: "__id", url: "__url", title: "__title" })({ ...raw, __id: id, __url: url, __title: title });
  if (!mapped) return { index, record: null, errors: ["could not be mapped"], warnings, excluded: false };
  const docsRaw = getPath(raw, map.documents);
  const docs = (Array.isArray(docsRaw) ? docsRaw : typeof docsRaw === "string" && docsRaw ? docsRaw.split(/[|;\s]+/) : [])
    .map((x) => (typeof x === "string" ? x : String((x as { url?: string })?.url ?? ""))).filter((u) => /^https:\/\//i.test(u));
  return {
    index, excluded: false, warnings, errors: [],
    record: {
      ...mapped,
      geo_state: onlyState,
      auction_start: start,
      auction_end: end,
      ...(val("auctionType") ? { auction_type: val("auctionType") } : {}),
      ...(docs.length ? { documents: JSON.stringify(docs.map((u, i) => ({ type: "SALE_NOTICE", title: `Document ${i + 1}`, url: u }))) } : {}),
    },
  };
}

export interface Batches { valid: ListingRecord[]; invalid: Array<{ index: number; errors: string[] }>; excluded: number; duplicates: Array<{ index: number; key: string }>; warnings: Record<string, number> }

export function normalizeAll(rows: Record<string, unknown>[], map: ExportMap, onlyState?: string): Batches {
  const out: Batches = { valid: [], invalid: [], excluded: 0, duplicates: [], warnings: {} };
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const r = normalizeRow(raw, map, i + 1, onlyState);
    if (r.excluded) { out.excluded++; return; }
    if (!r.record) { out.invalid.push({ index: r.index, errors: r.errors }); return; }
    const key = String(r.record.external_id);
    if (seen.has(key)) { out.duplicates.push({ index: r.index, key }); return; }
    seen.add(key);
    for (const w of r.warnings) out.warnings[w] = (out.warnings[w] ?? 0) + 1;
    out.valid.push(r.record);
  });
  return out;
}

// ---------------------------------------------------------------- import run

export interface ExportCheckpoint { fileHash: string; nextIndex: number; batches: number; created: number; updated: number; skipped: number; failed: number; startedAt: string; updatedAt: string; done: boolean; lastError?: string }

export const fileHash = (text: string, map: ExportMap) => createHash("sha256").update(text).update(JSON.stringify(map)).digest("hex");

/** Pure. Why a write is refused, or ok. */
export function exportWriteAllowed(env: Record<string, string | undefined>, confirm: boolean): { ok: true } | { ok: false; reason: string } {
  if (!confirm) return { ok: false, reason: "Dry run: nothing is written without --confirm-import." };
  const a = pagesAuthorization(env);
  if (!a.ok) return { ok: false, reason: a.reason };
  if (env.EAUCTIONS_SCOPE_EXPORT?.trim() !== "yes") return { ok: false, reason: "Import is disabled: EAUCTIONS_SCOPE_EXPORT is not \"yes\". Set it only after the operator's written permission, which must cover this export file, has been read." };
  return { ok: true };
}

export interface RunOptions {
  batch: Batches;
  rowsRead: number;
  declaredTotal: number | null;
  hash: string;
  mode: "dry" | "import";
  batchSize?: number;
  maxBatches?: number;
  restart?: boolean;
  importBatch?: (r: ListingRecord[]) => Promise<{ created: number; updated: number; skipped: number; failed: number }>;
  loadCheckpoint?: () => Promise<ExportCheckpoint | null>;
  saveCheckpoint?: (c: ExportCheckpoint) => Promise<void>;
  /** read-only: which of these keys already exist */
  existingKeys?: (keys: string[]) => Promise<string[]>;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface Reconciliation {
  mode: "dry" | "import";
  sourceTotal: number | null;
  rowsRead: number;
  valid: number;
  invalid: number;
  excludedNotRealEstate: number;
  duplicatesInFile: number;
  planned: number;
  /** dry run with a database lookup */
  wouldMatchExisting: number | null;
  wouldBeNew: number | null;
  /** this run and all runs so far (checkpoint) */
  thisRun: { batches: number; sent: number; created: number; updated: number; skipped: number; failed: number };
  total: { created: number; updated: number; skipped: number; failed: number };
  nextIndex: number;
  finished: boolean;
  state: "dry_run" | "completed" | "partial" | "failed_batch" | "already_completed" | "file_changed";
  /** true only when the source declared a total and every row was read and accounted for */
  fileCoverageVerified: boolean;
  message: string;
}

const BACKOFF = [1_000, 3_000, 9_000];

export async function runExportImport(o: RunOptions): Promise<Reconciliation> {
  const log = o.log ?? (() => undefined);
  const now = o.now ?? (() => new Date());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const size = Math.max(1, Math.min(500, Math.floor(o.batchSize ?? 100)));
  const planned = o.batch.valid.length;
  const accounted = planned + o.batch.invalid.length + o.batch.duplicates.length + o.batch.excluded;
  const rec: Reconciliation = {
    mode: o.mode, sourceTotal: o.declaredTotal, rowsRead: o.rowsRead, valid: planned, invalid: o.batch.invalid.length, excludedNotRealEstate: o.batch.excluded,
    duplicatesInFile: o.batch.duplicates.length, planned, wouldMatchExisting: null, wouldBeNew: null,
    thisRun: { batches: 0, sent: 0, created: 0, updated: 0, skipped: 0, failed: 0 }, total: { created: 0, updated: 0, skipped: 0, failed: 0 },
    nextIndex: 0, finished: false, state: "dry_run", fileCoverageVerified: o.declaredTotal !== null && o.rowsRead === o.declaredTotal && accounted === o.rowsRead, message: "",
  };

  if (o.mode === "dry") {
    if (o.existingKeys && planned) {
      const have = new Set<string>();
      for (let i = 0; i < planned; i += 500) for (const k of await o.existingKeys(o.batch.valid.slice(i, i + 500).map((r) => String(r.external_id)))) have.add(k);
      rec.wouldMatchExisting = have.size;
      rec.wouldBeNew = planned - have.size;
    }
    rec.message = `Dry run: ${planned} valid record(s) planned, ${rec.invalid} invalid, ${rec.duplicatesInFile} duplicate(s) in the file. Nothing was written.`;
    return rec;
  }

  let cp = !o.restart && o.loadCheckpoint ? await o.loadCheckpoint() : null;
  if (cp && cp.fileHash !== o.hash) {
    rec.state = "file_changed";
    rec.message = "A checkpoint exists for a DIFFERENT file or field map. Not resumed: use --restart to start over (database rows are never deleted).";
    return rec;
  }
  cp = cp ?? { fileHash: o.hash, nextIndex: 0, batches: 0, created: 0, updated: 0, skipped: 0, failed: 0, startedAt: now().toISOString(), updatedAt: now().toISOString(), done: false };
  rec.total = { created: cp.created, updated: cp.updated, skipped: cp.skipped, failed: cp.failed };
  rec.nextIndex = cp.nextIndex;
  if (cp.done && !o.restart) { rec.state = "already_completed"; rec.finished = true; rec.message = "This file was already imported completely (checkpoint). Use --restart to run it again."; return rec; }
  if (!o.importBatch) throw new Error("importBatch is required in import mode");

  while (cp.nextIndex < planned) {
    if (o.maxBatches !== undefined && rec.thisRun.batches >= o.maxBatches) break;
    const slice = o.batch.valid.slice(cp.nextIndex, cp.nextIndex + size);
    let res: Awaited<ReturnType<NonNullable<RunOptions["importBatch"]>>> | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt <= Math.min(o.retries ?? 3, BACKOFF.length); attempt++) {
      try { res = await o.importBatch(slice); break; }
      catch (e) {
        lastErr = e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "unknown error";
        log(`batch at ${cp.nextIndex} failed (${lastErr}); attempt ${attempt + 1}`);
        if (attempt < Math.min(o.retries ?? 3, BACKOFF.length)) await sleep(BACKOFF[attempt]);
      }
    }
    if (!res) {
      cp.lastError = lastErr; cp.updatedAt = now().toISOString();
      await o.saveCheckpoint?.(cp);
      rec.state = "failed_batch";
      rec.message = `Stopped: the batch starting at record ${cp.nextIndex + 1} failed after retries (${lastErr}). The checkpoint is kept; running the same command again resumes there.`;
      rec.nextIndex = cp.nextIndex; rec.total = { created: cp.created, updated: cp.updated, skipped: cp.skipped, failed: cp.failed };
      return rec;
    }
    cp.created += res.created; cp.updated += res.updated; cp.skipped += res.skipped; cp.failed += res.failed;
    cp.nextIndex += slice.length; cp.batches += 1; cp.lastError = undefined; cp.updatedAt = now().toISOString();
    rec.thisRun.batches += 1; rec.thisRun.sent += slice.length;
    rec.thisRun.created += res.created; rec.thisRun.updated += res.updated; rec.thisRun.skipped += res.skipped; rec.thisRun.failed += res.failed;
    await o.saveCheckpoint?.(cp); // saved after every batch
    log(`batch ${cp.batches}: ${cp.nextIndex}/${planned} sent; ${res.created} new, ${res.updated} updated, ${res.skipped} skipped, ${res.failed} failed`);
  }
  cp.done = cp.nextIndex >= planned;
  if (cp.done) await o.saveCheckpoint?.(cp);
  rec.finished = cp.done;
  rec.state = cp.done ? "completed" : "partial";
  rec.nextIndex = cp.nextIndex;
  rec.total = { created: cp.created, updated: cp.updated, skipped: cp.skipped, failed: cp.failed };
  rec.message = `${cp.done ? "Completed" : "Partial (resumable)"}: ${cp.nextIndex} of ${planned} valid record(s) sent to the importer so far.`;
  return rec;
}
