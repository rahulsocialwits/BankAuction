import { cleanText, moneyNumber } from "./richRaw";

/*
 * One place that turns a scraped / AI-read listing into the same clean format, whatever source it came from:
 * no markdown or HTML leftovers, no SHOUTING titles, amounts as plain rupee digits, one name per bank.
 */

const SMALL = new Set(["of", "in", "at", "the", "and", "for", "to", "on", "a", "an"]);
const KEEP_UPPER = /^(sbi|pnb|hdfc|icici|idbi|uco|bob|boi|nh|sh|rd|st|bhk|rcc|mig|lig|hig|ews|ii|iii|iv|vi|sez|gidc|midc|dlf|dda|hsr|btm|cbd)$/i;

/** "FLAT NO 12, SHANTI APARTMENTS" -> "Flat No 12, Shanti Apartments" (only when the text is mostly capitals). */
export function tidyCase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6) return s;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (upper / letters.length < 0.7) return s;
  return s
    .toLowerCase()
    .replace(/[a-z][a-z']*/g, (w, i: number) => (KEEP_UPPER.test(w) ? w.toUpperCase() : SMALL.has(w) && i > 0 ? w : w[0].toUpperCase() + w.slice(1)));
}

const BANK_ALIASES: Record<string, string> = {
  sbi: "State Bank of India",
  "state bank of india": "State Bank of India",
  pnb: "Punjab National Bank",
  "punjab national bank": "Punjab National Bank",
  bob: "Bank of Baroda",
  "bank of baroda": "Bank of Baroda",
  boi: "Bank of India",
  "bank of india": "Bank of India",
  ubi: "Union Bank of India",
  "union bank of india": "Union Bank of India",
  "union bank": "Union Bank of India",
  iob: "Indian Overseas Bank",
  "indian overseas bank": "Indian Overseas Bank",
  bom: "Bank of Maharashtra",
  "bank of maharashtra": "Bank of Maharashtra",
  "central bank of india": "Central Bank of India",
  "canara bank": "Canara Bank",
  "indian bank": "Indian Bank",
  "uco bank": "UCO Bank",
  "hdfc bank": "HDFC Bank",
  "icici bank": "ICICI Bank",
  "axis bank": "Axis Bank",
  "idbi bank": "IDBI Bank",
  "yes bank": "Yes Bank",
  "kotak mahindra bank": "Kotak Mahindra Bank",
};

/** "State Bank Of India Ltd." and "SBI" are the same bank: one key for both. */
export function bankKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(limited|ltd|the|co operative|cooperative)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The key under which a bank is looked up: aliases (SBI, PNB …) collapse onto the full name. */
export function canonicalBankKey(name: string): string {
  const k = bankKey(name);
  const alias = BANK_ALIASES[k];
  return alias ? bankKey(alias) : k;
}

export function canonicalBankName(name: string): string {
  const cleaned = tidyCase(cleanText(name)).slice(0, 80);
  return BANK_ALIASES[bankKey(name)] ?? cleaned;
}

const amount = (v: string | undefined, min: number): string => {
  const raw = String(v ?? "").trim();
  if (!raw || /%/.test(raw)) return "";
  const n = moneyNumber(raw);
  return n && Number(n) >= min ? n : "";
};

/** Returns a cleaned copy of a listing; the input is not changed. */
export function normalizeListing<T extends Record<string, string | undefined>>(rec: T): T {
  const out: Record<string, string | undefined> = { ...rec };
  const text = (k: string, max: number, fix = false) => {
    if (out[k] === undefined) return;
    let v = cleanText(String(out[k]));
    if (fix) v = tidyCase(v);
    out[k] = v.slice(0, max);
  };
  text("title", 200, true);
  text("location", 300, true);
  text("branch", 120, true);
  text("officer_name", 120, true);
  text("auction_type", 80);
  text("auction_method", 80);
  if (out.bank !== undefined) out.bank = String(out.bank).trim() ? canonicalBankName(String(out.bank)) : "";
  if (out.description !== undefined) {
    out.description = String(out.description)
      .replace(/<[^>]+>/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 4000);
  }
  for (const k of ["reserve_price", "emd", "minimum_increment"]) {
    if (out[k] !== undefined) out[k] = amount(out[k], k === "reserve_price" ? 1000 : 100);
  }
  if (out.officer_email !== undefined) {
    const e = String(out.officer_email).trim().toLowerCase();
    out.officer_email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
  }
  if (out.officer_phone !== undefined) out.officer_phone = String(out.officer_phone).replace(/[^\d+,\-\s/]/g, "").trim().slice(0, 40);
  return out as T;
}
