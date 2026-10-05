import { createHash } from "node:crypto";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import { isBlockedUrl } from "@/data-sources/feeds/blockedHosts";
import { importCsvText, importRecords, parseCsv, MAX_ROWS, type ImportResult, type ListingRecord } from "./csvImport";
import { moneyNumber, richRecordFromRow } from "./richRaw";

/**
 * Imports any spreadsheet-like text (a Google Sheet tab, a CSV from a bank, an upload) whatever its column names.
 *  1. Our own template (a "title" column): straight in.
 *  2. Clear column names (title / bank / reserve price / auction date …, including the "Phase 0" workbook's
 *     Raw Source Records and Properties tabs): mapped by code, no AI at all.
 *  3. Anything else: the Relay AI looks at the header and a few rows ONCE and says which column is which; the code
 *     applies that mapping to every row. A sheet with 5,000 rows costs one small AI call, not 5,000. The mapping (and a
 *     "not a property list" verdict) is remembered while the header is unchanged.
 * Big tabs are imported in batches with a saved cursor, so a run never exceeds its time budget.
 */

export interface TabMapping {
  headerRow: number;
  columns: Record<string, number | number[]>;
}
export interface TabState {
  hash?: string; // whole-tab content hash: unchanged => nothing to do
  mapKey?: string; // hash of the header + sample rows the mapping was made for
  mapping?: TabMapping;
  skipKey?: string; // header the AI already judged "not a property list": not asked again
  done?: number; // data rows already processed (cursor for big tabs)
  ver?: number; // import logic version: a newer one re-reads the whole tab once (fills and corrects earlier imports)
}

const IMPORT_VERSION = 2;

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

// "₹2.51 L" is 2,51,000, not 2.51: amounts with a Lakh / Crore / K unit are scaled.
const cleanMoney = (v: string | undefined): string => moneyNumber(v);

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

const cellOf = (r: string[], idx: number | undefined) => (idx === undefined ? "" : String(r[idx] ?? "").replace(/\s+/g, " ").trim());

/** One row -> one listing (null when the row has no title). `auction_start` may be [date column, time column]. */
function rowToRecord(r: string[], map: TabMapping): ListingRecord | null {
  const t = map.columns.title;
  const title = (Array.isArray(t) ? t.map((i) => cellOf(r, i)).filter(Boolean).join(" - ") : cellOf(r, t)).trim();
  if (!title) return null;
  const one = (f: string) => {
    const v = map.columns[f];
    return cellOf(r, Array.isArray(v) ? v[0] : v);
  };
  const start = map.columns.auction_start;
  const startText = Array.isArray(start) ? start.map((i) => cellOf(r, i)).filter(Boolean).join(" ") : one("auction_start");
  const possession = one("possession_status");
  return {
    title,
    bank: one("bank"),
    category: categoryFrom(one("category"), title),
    location: one("location"),
    description: one("description"),
    borrower: one("borrower"),
    reserve_price: cleanMoney(one("reserve_price")),
    emd: cleanMoney(one("emd")),
    auction_start: parseSheetDate(startText),
    auction_method: one("auction_method"),
    possession_status: /^[\\\-–—\s]*$/.test(possession) ? "" : possession,
    source_url: /^https?:\/\//i.test(one("source_url")) ? one("source_url") : "",
  };
}

function applyMapping(rows: string[][], map: TabMapping): ListingRecord[] {
  const out: ListingRecord[] = [];
  for (const r of rows.slice(map.headerRow + 1)) {
    const rec = rowToRecord(r, map);
    if (rec) out.push(rec);
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

// ---------------------------------------------------------------------------------------------------------------------
// Known layouts: clear column names are mapped by code (no AI, no tokens)
// ---------------------------------------------------------------------------------------------------------------------

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Normalised header name -> field. The first synonym that exists in the header wins (order matters).
const SYNONYMS: Record<string, string[]> = {
  title: ["title", "propertytitle", "rawtitle", "propertyname", "listingtitle", "assettitle"],
  bank: ["bank", "bankname", "rawbank", "institution", "lender"],
  category: ["category", "propertytype", "rawpropertytype", "assettype"],
  location: ["fulladdress", "rawlocation", "location", "city", "address"],
  description: ["description", "propertydescription", "rawdescription"],
  reserve_price: ["reserveprice", "rawreserveprice", "reserve", "baseprice"],
  emd: ["emd", "emdamount", "rawemd", "earnestmoney"],
  auction_start: ["auctiondate", "rawauctiondate", "auctionstart", "auctionstartdate", "dateofauction"],
  auction_time: ["auctiontime", "rawauctiontime"],
  possession_status: ["possessionstatus", "rawpossession"],
  source_url: ["sourcelistingurl", "sourceurl", "listingurl", "officialnoticeurl", "saleurl"],
};

export interface KnownLayout {
  kind: "raw_source" | "properties" | "generic";
  mapping: TabMapping;
  index: Record<string, number>; // normalised header -> column index
  typeIndex?: number; // the column that says what kind of asset it is (to keep movables out)
}

/** Recognises a tab whose column names say what they are. Returns null when the AI has to look at it. */
export function detectLayout(header: string[]): KnownLayout | null {
  const index: Record<string, number> = {};
  header.forEach((h, i) => { const k = norm(h); if (k && index[k] === undefined) index[k] = i; });
  const columns: Record<string, number | number[]> = {};
  for (const [field, names] of Object.entries(SYNONYMS)) {
    const hit = names.find((n) => index[n] !== undefined);
    if (hit) columns[field] = index[hit];
  }
  if (columns.title === undefined) return null;
  // A property list also carries at least two of: bank, price, place, auction date.
  const signals = ["bank", "reserve_price", "location", "auction_start"].filter((f) => columns[f] !== undefined).length;
  if (signals < 2) return null;
  if (columns.auction_start !== undefined && columns.auction_time !== undefined) columns.auction_start = [columns.auction_start as number, columns.auction_time as number];
  delete columns.auction_time;
  const kind = index.islatestsnapshot !== undefined ? "raw_source" : index.propertytitle !== undefined && index.propertyid !== undefined ? "properties" : "generic";
  return { kind, mapping: { headerRow: 0, columns }, index };
}

/** Typical movable assets: never imported (this site lists real estate only). */
const MOVABLE = /\b(machinery|machineries|gold|jewel+ery|ornaments?|bullion|silver|vehicles?|stock|inventory|shares?|securities|furniture|equipment|going concern|business)\b/i;

export interface RowVerdict {
  accept: boolean;
  reason?: string;
}

/** Row-level rules of a known layout: older snapshots, failed fetches, movables and blocked sources never come in. */
export function judgeRow(layout: KnownLayout, row: string[], rec: ListingRecord | null): RowVerdict {
  const get = (k: string) => String(row[layout.index[k]] ?? "").trim();
  if (!rec) return { accept: false, reason: "no title" };
  if (layout.kind === "raw_source") {
    if (get("islatestsnapshot").toUpperCase() !== "TRUE") return { accept: false, reason: "older snapshot" };
    if (layout.index.fetchstatus !== undefined && get("fetchstatus").toLowerCase() !== "success") return { accept: false, reason: "fetch error" };
    if (get("parsingstatus").toLowerCase() === "unparsed") return { accept: false, reason: "not parsed" };
  }
  if (layout.kind === "properties" && /(reject|duplicate|archiv|delet|inactive|removed)/i.test(get("recordstatus"))) return { accept: false, reason: "record not active" };
  const typeCol = layout.typeIndex;
  const type = typeCol === undefined ? "" : String(row[typeCol] ?? "");
  if (MOVABLE.test(type) || /^\s*(gold|jewel|vehicle|car|truck|tractor|machinery|plant (and|&) machinery)\b/i.test(rec.title ?? "")) return { accept: false, reason: "movable asset (not real estate)" };
  const urls = [rec.source_url, get("sourceurl"), get("sourcelistingurl")].filter(Boolean) as string[];
  if (urls.some((u) => isBlockedUrl(u))) return { accept: false, reason: "source is on the do-not-fetch list" };
  const ended = Date.parse(rec.auction_end || rec.auction_start || "");
  if (Number.isFinite(ended) && Date.now() - ended > STALE_MS) return { accept: false, reason: "auction ended more than 14 days ago" };
  return { accept: true };
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
  remaining?: number; // data rows still waiting for the next run
  notes?: string; // e.g. "42 older snapshot, 100 movable asset"
  state: TabState;
}

/**
 * The Auctions tab of the workbook, keyed by property_id: date/time, EMD and platform of each property\u0027s latest
 * (non-cancelled) auction. A re-auction replaces the earlier round; the property itself stays one record.
 */
export function auctionJoin(csv: string): Map<string, { start: string; emd: string; method: string }> {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const out = new Map<string, { start: string; emd: string; method: string }>();
  if (rows.length < 2) return out;
  const idx: Record<string, number> = {};
  rows[0].forEach((h, i) => { const k = norm(h); if (idx[k] === undefined) idx[k] = i; });
  if (idx.propertyid === undefined) return out;
  for (const r of rows.slice(1)) {
    const pid = String(r[idx.propertyid] ?? "").trim();
    if (!pid || /cancel/i.test(String(r[idx.auctionstatus] ?? ""))) continue;
    const start = parseSheetDate([r[idx.auctiondate], r[idx.auctiontime]].filter(Boolean).join(" "));
    const had = out.get(pid);
    if (!had || start > had.start) out.set(pid, { start, emd: cleanMoney(r[idx.emdamount]), method: String(r[idx.auctionplatform] ?? "").trim() });
  }
  return out;
}

/** Auctions that ended long ago are not imported as new listings (same rule as the built-in crawler). */
const STALE_MS = 14 * 864e5;

/** Rows of a tab -> listings, with the reasons rows were left out. Pure: no database. */
export function recordsFromRows(rows: string[][], layout: KnownLayout, from: number, to: number, join: Map<string, { start: string; emd: string; method: string }> | null = null) {
  const records: ListingRecord[] = [];
  const left: Record<string, number> = {};
  const data = rows.slice(1);
  for (let i = from; i < Math.min(to, data.length); i++) {
    const row = data[i];
    const rec = layout.kind === "raw_source" ? richRecordFromRow(row, (name) => String(row[layout.index[norm(name)]] ?? "").trim()) : rowToRecord(row, layout.mapping);
    const v = judgeRow(layout, row, rec);
    if (v.accept && rec && join) {
      const j = join.get(String(data[i][layout.index.propertyid] ?? "").trim());
      if (j) { rec.auction_start ||= j.start; rec.emd ||= j.emd; rec.auction_method ||= j.method; }
    }
    if (v.accept && rec) records.push(rec);
    else left[v.reason ?? "skipped"] = (left[v.reason ?? "skipped"] ?? 0) + 1;
  }
  return { records, left };
}

export const describeLeft = (left: Record<string, number>) => Object.entries(left).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ");

export async function importTabular(
  csv: string,
  statusSource: string,
  opts: { sourceUrl?: string; state?: TabState; force?: boolean; budgetMs?: number; auctionsCsv?: string } = {},
): Promise<TabularResult> {
  const text = csv.replace(/^﻿/, "");
  const hash = sha(text);
  const prev = opts.state ?? {};
  const base = { created: 0, skipped: 0, failed: 0, tokens: 0, usedAi: false };
  const deadline = Date.now() + (opts.budgetMs ?? 90_000);

  if (!opts.force && prev.hash === hash && (prev.mapKey !== "layout" || prev.ver === IMPORT_VERSION)) return { ...base, unchanged: true, state: prev };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ...base, skippedReason: "empty tab", state: { ...prev, hash } };

  // Our own template: no AI needed.
  if (rows[0].some((h) => h.trim().toLowerCase() === "title")) {
    const r = await importCsvText(text, statusSource);
    return { ...base, ...r, state: { ...prev, hash } };
  }

  // Not a property list at all (a registry, a log, a lookup table): leave it alone without asking the AI.
  const headerText = rows[0].map(norm).join(" ");
  const layout = detectLayout(rows[0]);
  if (!layout && !/(title|property|reserve|emd|auction|address|location|listing|asset)/.test(headerText)) {
    return { ...base, skippedReason: "not a property list (no property columns)", state: { ...prev, hash } };
  }

  if (layout) {
    // Clear column names: mapped by code. Big tabs continue from the saved cursor.
    layout.typeIndex = layout.index.rawpropertytype ?? layout.index.propertytype ?? layout.index.assettype ?? layout.index.category;
    const join = layout.kind === "properties" && opts.auctionsCsv ? auctionJoin(opts.auctionsCsv) : null;
    const total = rows.length - 1;
    let cursor = prev.mapKey === "layout" && prev.ver === IMPORT_VERSION && typeof prev.done === "number" && prev.done <= total ? prev.done : 0;
    const leftAll: Record<string, number> = {};
    let acc: ImportResult = { created: 0, skipped: 0, failed: 0, updated: 0 };
    const STEP = MAX_ROWS;
    while (cursor < total && Date.now() < deadline) {
      const to = Math.min(cursor + STEP, total);
      const { records, left } = recordsFromRows(rows, layout, cursor, to, join);
      for (const [k, n] of Object.entries(left)) leftAll[k] = (leftAll[k] ?? 0) + n;
      if (records.length) {
        const r = await importRecords(records, statusSource, "PUBLISHED", opts.sourceUrl, { enrich: layout.kind === "raw_source" });
        acc = { created: acc.created + r.created, skipped: acc.skipped + r.skipped, failed: acc.failed + r.failed, updated: (acc.updated ?? 0) + (r.updated ?? 0) };
      }
      cursor = to;
    }
    const complete = cursor >= total;
    return {
      ...base,
      ...acc,
      remaining: total - cursor,
      notes: describeLeft(leftAll),
      state: { hash: complete ? hash : undefined, mapKey: "layout", done: cursor, ver: IMPORT_VERSION },
    };
  }

  // Unknown layout: the AI maps it once (and remembers a "not a property list" verdict).
  const cfg = await getAiConfig();
  const width = Math.max(...rows.slice(0, 8).map((r) => r.length));
  const sample = rows.slice(0, 8).map((r) => r.slice(0, 24).map((c) => c.replace(/\s+/g, " ").trim().slice(0, 70)));
  const mapKey = sha(JSON.stringify(sample.slice(0, 3)));
  if (prev.skipKey === mapKey) return { ...base, skippedReason: "not a property list (checked before)", state: { ...prev, hash } };

  let mapping: TabMapping | null = prev.mapKey === mapKey ? (prev.mapping ?? null) : null;
  let tokens = 0;
  let usedAi = false;
  if (!mapping) {
    if (!cfg.enabled) return { ...base, skippedReason: "AI is switched off", state: { ...prev, hash } };
    const ai = await chatJSONDetailed<{ skip?: boolean; reason?: string; header_row?: number; columns?: Record<string, unknown> }>(SYSTEM, JSON.stringify(sample));
    tokens = ai.tokens;
    usedAi = true;
    if (ai.data?.skip) return { ...base, tokens, usedAi, skippedReason: ai.data.reason ?? "not a property list", state: { ...prev, hash, skipKey: mapKey, mapKey: undefined, mapping: undefined } };
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
