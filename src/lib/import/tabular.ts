import { createHash } from "node:crypto";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import { importCsvText, importRecords, parseCsv, MAX_ROWS, type ImportResult, type ListingRecord } from "./csvImport";

/**
 * Imports any spreadsheet-like text (a Google Sheet tab, a CSV from a bank, an upload) whatever its column names.
 * If it already uses our template (a "title" column) it goes straight in. Otherwise the Relay AI looks at the
 * header and a few rows ONCE, says which column is which, and the code applies that mapping to every row —
 * so a sheet with 5,000 rows costs one small AI call, not 5,000. The mapping is remembered while the header is unchanged.
 */

export interface TabMapping {
  headerRow: number;
  columns: Record<string, number | number[]>;
}
export interface TabState {
  hash?: string; // whole-tab content hash: unchanged => nothing to do
  mapKey?: string; // hash of the header + sample rows the mapping was made for
  mapping?: TabMapping;
}

const FIELDS = ["title", "bank", "category", "location", "description", "borrower", "reserve_price", "emd", "auction_start", "auction_method", "possession_status", "source_url"] as const;

const SYSTEM = `You map the columns of a spreadsheet of Indian bank-auction properties to fixed fields. You are given the first rows as a JSON array of arrays (cell texts, 0-based column indexes).
Decide:
- skip: true if this sheet is NOT a list of property auctions (notes, summary, vehicles-only, empty).
- header_row: the 0-based index of the row that holds the column names (use 0 if the first row is the header).
- columns: for each field below, the 0-based column index that holds it, or omit the field if no column does. "title" may be an ARRAY of column indexes (for example property type + address) when there is no single title column.
Fields: title, bank, category, location (city), description, borrower, reserve_price, emd, auction_start, auction_method, possession_status, source_url (a link to the notice).
Rules: never invent columns; if you are unsure about a field omit it; a property needs at least a title (or something to build one from).
Reply ONLY with JSON: {"skip":false,"header_row":0,"columns":{"title":[1,2],"bank":3,"reserve_price":7}}`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function cleanMoney(v: string | undefined): string {
  const m = String(v ?? "").replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "").match(/\d+(\.\d+)?/);
  return m ? m[0] : "";
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Accepts ISO, 31/12/2026, 31-12-2026, "31 Dec 2026" (+ optional time). Indian day-first order. Returns "YYYY-MM-DDTHH:mm" or "". */
export function parseSheetDate(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let y: number, mo: number, d: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/))) [d, mo, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  else if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})/))) [d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()] ?? 0, +m[3]];
  else return "";
  if (!mo || mo > 12 || d < 1 || d > 31) return "";
  let hh = 11, mm = 0; // listings without a time default to 11:00
  const t = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (t) {
    hh = +t[1];
    mm = +t[2];
    if (t[3]?.toLowerCase() === "pm" && hh < 12) hh += 12;
    if (t[3]?.toLowerCase() === "am" && hh === 12) hh = 0;
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(hh)}:${p(mm)}`;
}

function categoryFrom(raw: string | undefined, title: string): string {
  const s = `${raw ?? ""} ${title}`.toLowerCase();
  if (/agricultur|farm/.test(s)) return "AGRICULTURAL";
  if (/industrial|factory|godown|warehouse|plant/.test(s)) return "INDUSTRIAL";
  if (/commercial|shop|office|showroom|complex/.test(s)) return "COMMERCIAL";
  if (/plot|land|site\b/.test(s) && !/building|flat|house/.test(s)) return "LAND_PLOT";
  if (/residential|flat|apartment|house|villa|bungalow|row ?house|bhk/.test(s)) return "RESIDENTIAL";
  return "";
}

function applyMapping(rows: string[][], map: TabMapping): ListingRecord[] {
  const cell = (r: string[], idx: number | undefined) => (idx === undefined ? "" : String(r[idx] ?? "").replace(/\s+/g, " ").trim());
  const out: ListingRecord[] = [];
  for (const r of rows.slice(map.headerRow + 1)) {
    const t = map.columns.title;
    const title = (Array.isArray(t) ? t.map((i) => cell(r, i)).filter(Boolean).join(" - ") : cell(r, t)).trim();
    if (!title) continue;
    const one = (f: string) => {
      const v = map.columns[f];
      return cell(r, Array.isArray(v) ? v[0] : v);
    };
    out.push({
      title,
      bank: one("bank"),
      category: categoryFrom(one("category"), title),
      location: one("location"),
      description: one("description"),
      borrower: one("borrower"),
      reserve_price: cleanMoney(one("reserve_price")),
      emd: cleanMoney(one("emd")),
      auction_start: parseSheetDate(one("auction_start")),
      auction_method: one("auction_method"),
      possession_status: one("possession_status"),
      source_url: /^https?:\/\//i.test(one("source_url")) ? one("source_url") : "",
    });
  }
  return out;
}

function validMapping(m: unknown, width: number): TabMapping | null {
  if (!m || typeof m !== "object") return null;
  const { header_row, columns } = m as { header_row?: unknown; columns?: Record<string, unknown> };
  if (!columns || typeof columns !== "object") return null;
  const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < Math.max(width, 1);
  const cols: Record<string, number | number[]> = {};
  for (const f of FIELDS) {
    const v = columns[f];
    if (Array.isArray(v)) {
      const list = v.filter(ok);
      if (list.length) cols[f] = list;
    } else if (ok(v)) cols[f] = v;
  }
  if (cols.title === undefined) return null;
  return { headerRow: Number.isInteger(header_row) && (header_row as number) >= 0 && (header_row as number) < 10 ? (header_row as number) : 0, columns: cols };
}

/** Dry run for tests and the admin: what the AI would map, and the first rows it would import. Writes nothing. */
export async function previewTabular(csv: string, take = 3) {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  const width = Math.max(1, ...rows.slice(0, 8).map((r) => r.length));
  const sample = rows.slice(0, 8).map((r) => r.slice(0, 24).map((c) => c.replace(/\s+/g, " ").trim().slice(0, 70)));
  const ai = await chatJSONDetailed<{ skip?: boolean; reason?: string; header_row?: number; columns?: Record<string, unknown> }>(SYSTEM, JSON.stringify(sample));
  const mapping = validMapping(ai.data, width);
  return { raw: ai.data, mapping, tokens: ai.tokens, model: ai.model, records: mapping ? applyMapping(rows, mapping).slice(0, take) : [] };
}

export interface TabularResult extends ImportResult {
  tokens: number;
  usedAi: boolean;
  unchanged?: boolean;
  skippedReason?: string;
  state: TabState;
}

export async function importTabular(csv: string, statusSource: string, opts: { sourceUrl?: string; state?: TabState; force?: boolean } = {}): Promise<TabularResult> {
  const text = csv.replace(/^﻿/, "");
  const hash = sha(text);
  const prev = opts.state ?? {};
  const base = { created: 0, skipped: 0, failed: 0, tokens: 0, usedAi: false };

  if (!opts.force && prev.hash === hash) return { ...base, unchanged: true, state: prev };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ...base, skippedReason: "empty tab", state: { ...prev, hash } };

  // Our own template: no AI needed.
  if (rows[0].some((h) => h.trim().toLowerCase() === "title")) {
    const r = await importCsvText(text, statusSource);
    return { ...base, ...r, state: { ...prev, hash } };
  }

  const cfg = await getAiConfig();
  const width = Math.max(...rows.slice(0, 8).map((r) => r.length));
  const sample = rows.slice(0, 8).map((r) => r.slice(0, 24).map((c) => c.replace(/\s+/g, " ").trim().slice(0, 70)));
  const mapKey = sha(JSON.stringify(sample.slice(0, 3)));

  let mapping: TabMapping | null = prev.mapKey === mapKey ? (prev.mapping ?? null) : null;
  let tokens = 0;
  let usedAi = false;
  if (!mapping) {
    if (!cfg.enabled) return { ...base, skippedReason: "AI is switched off", state: { ...prev, hash } };
    const ai = await chatJSONDetailed<{ skip?: boolean; reason?: string; header_row?: number; columns?: Record<string, unknown> }>(SYSTEM, JSON.stringify(sample));
    tokens = ai.tokens;
    usedAi = true;
    if (ai.data?.skip) return { ...base, tokens, usedAi, skippedReason: ai.data.reason ?? "not a property list", state: { ...prev, hash, mapKey, mapping: undefined } };
    mapping = validMapping(ai.data, width);
    if (!mapping) return { ...base, tokens, usedAi, skippedReason: "AI could not find a title column", state: { ...prev, hash } };
  }

  const records = applyMapping(rows, mapping);
  let total: ImportResult = { created: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < records.length; i += MAX_ROWS) {
    const r = await importRecords(records.slice(i, i + MAX_ROWS), statusSource, "PUBLISHED", opts.sourceUrl);
    total = { created: total.created + r.created, skipped: total.skipped + r.skipped, failed: total.failed + r.failed };
  }
  return { ...total, tokens, usedAi, state: { hash, mapKey, mapping } };
}
