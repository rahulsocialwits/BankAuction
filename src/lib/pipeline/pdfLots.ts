/*
 * PDF multi-lot extraction (Phase 3, PR 8). Pure functions: text in, validated lots out. No network, no database, no AI.
 *
 * A bank sale notice often lists many properties ("lots") in one PDF. One PDF is NOT one auction. This module:
 *   1. refuses to read a scanned PDF (status NEEDS_OCR, nothing extracted, nothing invented);
 *   2. finds the lot boundaries (explicit "Lot No. n" style markers, a numbered table, or a single-property notice);
 *   3. reads reserve price, EMD, auction date and address of each lot ONLY from labelled text of that lot;
 *   4. validates (amounts, calendar dates, EMD below reserve, date not before the notice, pincode) and attaches a confidence;
 *   5. leaves a value empty (and says why) whenever it is missing, repeated with different values, or inconsistent. It never guesses.
 *
 * It is NOT wired into ingestion: producing import records from a PDF is a separate, owner-approved step (see the handover).
 * OCR is out of scope: a scanned notice is reported as needing OCR.
 */

import type { ListingRecord } from "@/lib/import/csvImport";

export type PdfStatus = "OK" | "PARTIAL" | "NEEDS_OCR" | "NO_LOTS" | "AMBIGUOUS";
export type LotStrategy = "marker:lot" | "marker:serial" | "table" | "numbered" | "single";

export interface PdfLot {
  /** the number printed in the notice, as text */
  lotNumber: string;
  address: string | null;
  reservePrice: number | null;
  emd: number | null;
  /** YYYY-MM-DD (calendar date as printed; the time of day is not read) */
  auctionDate: string | null;
  /** where the date came from: the lot itself, or the notice header that gives one date for every lot */
  dateSource: "lot" | "notice" | null;
  /** 0..1 */
  confidence: number;
  /** problems found; an empty list means every read value passed its checks */
  issues: string[];
  /** reserve price, auction date and address are all present and valid */
  complete: boolean;
  /** the text this lot was read from (trimmed), so a person can check it */
  excerpt: string;
}

export interface PdfExtraction {
  status: PdfStatus;
  /** provenance method for the observations written later (fieldProvenance ExtractionMethod) */
  method: "pdf";
  strategy: LotStrategy | null;
  lots: PdfLot[];
  /** the number of properties the notice itself claims, when it says so */
  claimedLots: number | null;
  notes: string[];
}

/* ---------- text helpers ---------- */

const clean = (t: string) => t.replace(/\r/g, "").replace(/[ \t\f\v]+/g, " ");
const flat = (t: string) => t.replace(/\s+/g, " ").trim();

/** A PDF with (almost) no text layer is an image. */
export function looksScanned(text: string): boolean {
  const letters = (text.match(/[A-Za-z0-9]/g) ?? []).length;
  return letters < 120;
}

const LAKH = 100_000;
const CRORE = 10_000_000;

/** First amount in `s`: "Rs. 45,00,000/-", "₹4500000", "45 lakhs", "1.2 crore". Null when there is none. */
export function parseAmount(s: string): number | null {
  const m = /(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(?:\/-)?\s*(lakhs?|lacs?|crores?|cr\b)?/i.exec(s);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[3] ?? "").toLowerCase();
  if (unit.startsWith("la")) n *= LAKH;
  else if (unit.startsWith("cr")) n *= CRORE;
  return Math.round(n);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validDate(y: number, mo: number, d: number): string | null {
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First date in `s` (dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, "12th November 2026"). "invalid" when a date is printed but impossible. */
export function parseDate(s: string): string | "invalid" | null {
  const num = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/.exec(s);
  const word = /(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.-]+(\d{4})/i.exec(s);
  const pick = [num, word].filter((m): m is RegExpExecArray => !!m).sort((a, b) => a.index - b.index)[0];
  if (!pick) return null;
  const out = pick === num ? validDate(Number(pick[3]), Number(pick[2]), Number(pick[1])) : validDate(Number(pick[3]), MONTHS.indexOf(pick[2].toLowerCase()) + 1, Number(pick[1]));
  return out ?? "invalid";
}

/* ---------- labels ---------- */

const RESERVE = /(?:reserve|upset)\s*price/gi;
const EMD = /\b(?:emd|earnest\s*money(?:\s*deposit)?)\b/gi;
const AUCTION_DATE = /(?:date\s*(?:&|and)?\s*time\s*of\s*(?:the\s*)?(?:e-?\s*)?auction|(?:e-?\s*)?auction\s*date|date\s*of\s*(?:the\s*)?(?:e-?\s*)?(?:auction|sale)|(?:e-?\s*)?auction\s*on)/gi;
const ADDRESS = /(?:description\s+of\s+(?:the\s+)?(?:immovable\s+|secured\s+)?propert(?:y|ies)|property\s+description|address\s+of\s+(?:the\s+)?propert(?:y|ies)|address|location|schedule\s+of\s+(?:the\s+)?propert(?:y|ies)|details\s+of\s+(?:the\s+)?propert(?:y|ies))\s*[:\-–]?/gi;
/** words that begin the NEXT field; a value never runs past one */
const STOP = /(?:(?:reserve|upset)\s*price|\bemd\b|earnest|\bdate\b|borrower|contact|inspection|\blot\s*no|name\s*of|possession|outstanding|encumbrance|bid\s*(?:increment|multiplier))/i;

const matchesOf = (text: string, re: RegExp) => [...text.matchAll(new RegExp(re.source, re.flags))];

/** The text right after a label, cut at the next field label (so a missing value never borrows the next field's). */
function after(text: string, labelEnd: number, max = 240): string {
  const rest = text.slice(labelEnd, labelEnd + max);
  const stop = STOP.exec(rest.replace(/^[\s:\-–.=|]*/, ""));
  const lead = rest.length - rest.replace(/^[\s:\-–.=|]*/, "").length;
  return stop ? rest.slice(0, lead + stop.index) : rest;
}

type Read<T> = { value: T | null; issue?: string };

function readAmount(block: string, label: RegExp, name: string): Read<number> {
  const found: number[] = [];
  for (const m of matchesOf(block, label)) {
    const v = parseAmount(after(block, m.index! + m[0].length, 80));
    if (v !== null) found.push(v);
  }
  if (found.length === 0) return { value: null, issue: `${name}_missing` };
  if (new Set(found).size > 1) return { value: null, issue: `${name}_conflicting` };
  const v = found[0];
  if (v < 10_000 || v > 5e10) return { value: null, issue: `${name}_implausible` };
  return { value: v };
}

function readDate(block: string): Read<string> {
  const found: string[] = [];
  let invalid = false;
  for (const m of matchesOf(block, AUCTION_DATE)) {
    const d = parseDate(after(block, m.index! + m[0].length, 80));
    if (d === "invalid") invalid = true;
    else if (d) found.push(d);
  }
  if (invalid && found.length === 0) return { value: null, issue: "date_invalid" };
  if (found.length === 0) return { value: null, issue: "date_missing" };
  if (new Set(found).size > 1) return { value: null, issue: "date_conflicting" };
  return { value: found[0] };
}

function readAddress(block: string): Read<string> {
  const ms = matchesOf(block, ADDRESS);
  const vals: string[] = [];
  for (const m of ms) {
    const v = flat(after(block, m.index! + m[0].length, 420));
    if (v.length >= 15 && /[A-Za-z]{3}/.test(v)) vals.push(v);
  }
  if (vals.length === 0) return { value: null, issue: "address_missing" };
  const v = vals.sort((a, b) => b.length - a.length)[0];
  const pin = /\b(\d{6})\b/.exec(v);
  if (pin && pin[1][0] === "0") return { value: v, issue: "pincode_invalid" };
  return { value: v };
}

/* ---------- lot boundaries ---------- */

const MARKERS: { strategy: LotStrategy; re: RegExp }[] = [
  { strategy: "marker:lot", re: /^[ \t]*(?:lot|property|item)[ \t]*(?:no\.?|number|#)?[ \t]*[:.\-]?[ \t]*(\d{1,3})\b/gim },
  { strategy: "marker:serial", re: /^[ \t]*(?:sr\.?|s\.?)[ \t]*no\.?[ \t]*[:.\-]?[ \t]*(\d{1,3})\b/gim },
  { strategy: "numbered", re: /^[ \t]*(\d{1,3})[ \t]*[.)][ \t]+\S/gm },
];
const TRAILER = /^[ \t]*(?:terms\s*(?:&|and)\s*conditions|general\s*terms|important\s*(?:notes?|information)|note\s*:|for\s*detailed\s*terms)/gim;

interface Cut {
  num: string;
  start: number;
}

/** The longest run of markers numbered n, n+1, n+2 ... in text order (stray numbers inside a lot are ignored). */
function longestRun(cuts: Cut[]): Cut[] {
  let best: Cut[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const run = [cuts[i]];
    let want = Number(cuts[i].num) + 1;
    for (let j = i + 1; j < cuts.length; j++) {
      if (Number(cuts[j].num) === want) {
        run.push(cuts[j]);
        want++;
      }
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

function blocksOf(text: string, run: Cut[]): { num: string; text: string }[] {
  const out: { num: string; text: string }[] = [];
  for (let i = 0; i < run.length; i++) {
    let end = i + 1 < run.length ? run[i + 1].start : text.length;
    if (i === run.length - 1) {
      const tail = matchesOf(text.slice(run[i].start), TRAILER)[0];
      if (tail) end = run[i].start + tail.index!;
    }
    out.push({ num: run[i].num, text: text.slice(run[i].start, end) });
  }
  return out;
}

const hasSignal = (b: string) => matchesOf(b, RESERVE).length > 0 || matchesOf(b, ADDRESS).length > 0;

/** A header row naming the money columns: the row text then lists amounts in that order. */
function tableHeader(text: string): { index: number; order: ("reserve" | "emd")[] } | null {
  for (const m of text.matchAll(/^.*(?:reserve|upset)\s*price.*$/gim)) {
    const line = m[0];
    const cols: { at: number; kind: "reserve" | "emd" }[] = [];
    const r = /(?:reserve|upset)\s*price/i.exec(line);
    const e = /\b(?:emd|earnest\s*money)/i.exec(line);
    if (r) cols.push({ at: r.index, kind: "reserve" });
    if (e) cols.push({ at: e.index, kind: "emd" });
    if (cols.length >= 1 && /(?:sr|s)\.?\s*no|description|property|date/i.test(line)) return { index: m.index!, order: cols.sort((a, b) => a.at - b.at).map((c) => c.kind) };
  }
  return null;
}

/* ---------- lot assembly ---------- */

function noticeDateOf(text: string): string | null {
  const f = parseDate(text.slice(0, 600).match(/(?:dated?|notice\s*date)\s*[:\-]?\s*([^\n]{0,40})/i)?.[1] ?? "");
  return f && f !== "invalid" ? f : null;
}

function headerAuctionDate(preamble: string): string | null {
  const found = new Set<string>();
  for (const m of matchesOf(preamble, AUCTION_DATE)) {
    const d = parseDate(after(preamble, m.index! + m[0].length, 80));
    if (d && d !== "invalid") found.add(d);
  }
  return found.size === 1 ? [...found][0] : null;
}

function claimedCount(text: string): number | null {
  const m = /\b(?:total\s*(?:of\s*)?)?(\d{1,3})\s*(?:\(\s*[a-z-]+\s*\)\s*)?(?:properties|lots|assets)\b/i.exec(text.slice(0, 1500));
  const n = m ? Number(m[1]) : null;
  return n && n >= 1 && n <= 500 ? n : null;
}

function buildLot(num: string, blockText: string, opts: { headerDate: string | null; noticeDate: string | null }): PdfLot {
  const issues: string[] = [];
  const reserve = readAmount(blockText, RESERVE, "reserve");
  const emd = readAmount(blockText, EMD, "emd");
  const date = readDate(blockText);
  const address = readAddress(blockText);
  for (const r of [reserve, emd, date, address]) if (r.issue) issues.push(r.issue);

  let reservePrice = reserve.value;
  let emdValue = emd.value;
  if (reservePrice !== null && emdValue !== null && emdValue >= reservePrice) {
    // Either column could be the wrong one (scrambled): keep neither rather than guess which.
    issues.push("price_inconsistent");
    reservePrice = null;
    emdValue = null;
  }
  let auctionDate = date.value;
  let dateSource: PdfLot["dateSource"] = auctionDate ? "lot" : null;
  if (!auctionDate && date.issue === "date_missing" && opts.headerDate) {
    auctionDate = opts.headerDate;
    dateSource = "notice";
    issues.splice(issues.indexOf("date_missing"), 1);
  }
  if (auctionDate && opts.noticeDate && auctionDate < opts.noticeDate) {
    issues.push("auction_before_notice");
    auctionDate = null;
    dateSource = null;
  }
  const addr = address.value;
  if (address.issue === "pincode_invalid") issues.push("pincode_invalid");

  const blocking = ["price_inconsistent", "reserve_conflicting", "reserve_implausible", "date_conflicting", "date_invalid", "auction_before_notice"];
  let confidence = (reservePrice !== null ? 0.35 : 0) + (auctionDate ? (dateSource === "lot" ? 0.25 : 0.15) : 0) + (addr ? 0.3 : 0) + (emdValue !== null ? 0.1 : 0);
  confidence -= 0.15 * issues.filter((i) => blocking.includes(i) || i === "pincode_invalid").length;
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  return {
    lotNumber: num,
    address: addr,
    reservePrice,
    emd: emdValue,
    auctionDate,
    dateSource,
    confidence,
    issues: [...new Set(issues)],
    complete: reservePrice !== null && !!auctionDate && !!addr && !issues.includes("pincode_invalid"),
    excerpt: flat(blockText).slice(0, 300),
  };
}

function tableLots(text: string, header: { index: number; order: ("reserve" | "emd")[] }, ctx: { headerDate: string | null; noticeDate: string | null }): PdfLot[] {
  const body = text.slice(header.index).split("\n").slice(1);
  const rows: { num: string; text: string }[] = [];
  for (const line of body) {
    const m = /^[ \t]*(\d{1,3})[ \t]+(\S.*)$/.exec(line);
    if (m && Number(m[1]) === rows.length + 1) rows.push({ num: m[1], text: m[2] });
    else if (rows.length && !/^[ \t]*$/.test(line)) {
      if (TRAILER.test(line)) break;
      rows[rows.length - 1].text += " " + line.trim();
    }
    TRAILER.lastIndex = 0;
  }
  return rows.map((r) => {
    const dateM = parseDate(r.text);
    const amounts = [...r.text.matchAll(/(?:rs\.?|₹)?\s*(\d{1,3}(?:,\d{2,3})+)\s*(?:\/-)?/gi)].map((a) => parseAmount(a[0])).filter((n): n is number => n !== null);
    const issues: string[] = [];
    let reservePrice: number | null = null;
    let emd: number | null = null;
    if (amounts.length === header.order.length) {
      header.order.forEach((k, i) => {
        if (k === "reserve") reservePrice = amounts[i];
        else emd = amounts[i];
      });
    } else issues.push("columns_not_aligned");
    const firstAmount = /(?:rs\.?|₹)?\s*\d{1,3}(?:,\d{2,3})+/i.exec(r.text);
    const desc = flat(firstAmount ? r.text.slice(0, firstAmount.index) : r.text);
    // build via the same checks as a labelled lot, by presenting the row as labelled text
    const synthetic = [`Description of Property: ${desc}`, reservePrice !== null ? `Reserve Price: ${reservePrice}` : "", emd !== null ? `EMD: ${emd}` : "", typeof dateM === "string" && dateM !== "invalid" ? `Auction Date: ${dateM.split("-").reverse().join(".")}` : ""].join("\n");
    const lot = buildLot(r.num, synthetic, ctx);
    for (const i of issues) if (!lot.issues.includes(i)) lot.issues.push(i);
    if (dateM === "invalid" && !lot.issues.includes("date_invalid")) lot.issues.push("date_invalid");
    lot.excerpt = flat(r.text).slice(0, 300);
    return lot;
  });
}

export function extractPdfLots(rawText: string): PdfExtraction {
  const base = { method: "pdf" as const, strategy: null as LotStrategy | null, lots: [] as PdfLot[], claimedLots: null as number | null, notes: [] as string[] };
  const text = clean(rawText ?? "");
  if (looksScanned(text)) return { ...base, status: "NEEDS_OCR", notes: ["The PDF has no readable text layer (a scanned image). It needs OCR; nothing was extracted."] };

  const claimed = claimedCount(text);
  const noticeDate = noticeDateOf(text);
  const out: PdfExtraction = { ...base, status: "NO_LOTS", claimedLots: claimed };

  let blocks: { num: string; text: string }[] = [];
  let strategy: LotStrategy | null = null;
  let preamble = text;

  for (const { strategy: s, re } of MARKERS) {
    const cuts: Cut[] = matchesOf(text, re).map((m) => ({ num: m[1], start: m.index! }));
    const run = longestRun(cuts);
    if (run.length === 0 || (s === "numbered" && run.length < 2)) continue;
    const candidate = blocksOf(text, run);
    if (!candidate.some((b) => hasSignal(b.text))) continue;
    blocks = candidate.filter((b) => hasSignal(b.text));
    strategy = s;
    preamble = text.slice(0, run[0].start);
    break;
  }

  const headerDate = headerAuctionDate(preamble);
  const ctx = { headerDate, noticeDate };
  if (blocks.length > 0) {
    out.lots = blocks.map((b) => buildLot(b.num, b.text, ctx));
    out.strategy = strategy;
  } else {
    const header = tableHeader(text);
    const tl = header ? tableLots(text, header, ctx) : [];
    if (tl.length > 0) {
      out.lots = tl;
      out.strategy = "table";
    } else if (matchesOf(text, RESERVE).length === 1) {
      out.lots = [buildLot("1", text, { headerDate: headerAuctionDate(text), noticeDate })];
      out.strategy = "single";
      out.notes.push("No lot markers; one reserve price found, so the notice is read as a single property.");
    } else if (matchesOf(text, RESERVE).length > 1) {
      return { ...out, status: "AMBIGUOUS", notes: [`${matchesOf(text, RESERVE).length} reserve prices but no lot markers or table to tell the properties apart; nothing was split.`] };
    } else {
      return { ...out, status: "NO_LOTS", notes: ["No lot markers, table or reserve price found; nothing was extracted."] };
    }
  }

  const found = out.lots.length;
  if (claimed !== null && found < claimed) {
    out.status = "PARTIAL";
    out.notes.push(`The notice says ${claimed} properties but ${found} were found; the rest were not read.`);
  } else {
    out.status = "OK";
    if (claimed !== null && found > claimed) out.notes.push(`The notice says ${claimed} properties but ${found} lots were found; check the split.`);
  }
  const incomplete = out.lots.filter((l) => !l.complete).length;
  if (incomplete) out.notes.push(`${incomplete} of ${found} lot(s) are missing a validated reserve price, date or address and must not be imported as complete.`);
  return out;
}

/* ---------- mapping to import records (not wired to ingestion) ---------- */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/**
 * Import records for the COMPLETE lots only. Incomplete lots are never turned into records: strict import would reject them, and
 * a half-read lot must not become a listing. external_id is source-qualified and stable per (document, lot number).
 */
export function lotsToListingRecords(x: PdfExtraction, ctx: { documentUrl: string; bank?: string }): ListingRecord[] {
  let host = "pdf";
  try {
    host = new URL(ctx.documentUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep generic host */
  }
  return x.lots
    .filter((l) => l.complete && l.address && l.reservePrice !== null && l.auctionDate)
    .map((l) => ({
      title: `Lot ${l.lotNumber}: ${l.address!.slice(0, 90)}`,
      bank: ctx.bank ?? "",
      location: l.address!.slice(0, 200),
      legal_schedule: l.address!.slice(0, 900),
      reserve_price: String(l.reservePrice),
      emd: l.emd !== null ? String(l.emd) : "",
      auction_start: l.auctionDate!,
      auction_method: "E-Auction",
      external_id: `src:${host}:pdf-${hash(ctx.documentUrl)}-lot${l.lotNumber}`,
      source_url: ctx.documentUrl,
    }));
}
