import * as cheerio from "cheerio";
import { unwrapViewSource } from "./maharashtra";

/*
 * The 105 institutions of the owner's reference list, matched against what eAuctionsIndia itself shows (its institution directory, bank links and the
 * institution logos on listing cards). Matching is EXACT after normalisation (case, "&" = "and", punctuation, legal suffixes, "co-operative", "asset
 * reconstruction company" = "ARC") plus a small table of official name variations. There is no substring or fuzzy matching: "Bank of India" must never
 * match "Bank of Baroda", "ICICI Bank" never "ICICI Home Finance Company", "Indian Bank" never "Indian Overseas Bank".
 * A name is CONFIRMED only when eAuctionsIndia shows it. Without a directory it cannot be called MISSING; it stays UNCERTAIN.
 */

export const ORIGINAL_INSTITUTIONS: readonly string[] = [
  "Aadhar Housing Finance Ltd", "Aavas Financiers", "Acre India Arc", "aditya birla capital", "Aditya Birla Housing Finance", "Alchemist Asset Reconstruction Company Ltd",
  "ambit finvest", "Anand Rathi Global Finance", "arcil", "Asrec India Limited", "AU Small Finance Bank", "Authum Investment & Infrastructure Ltd", "Axis Bank",
  "Bajaj Housing Finance Limited", "Bangalore City Co Operative Bank", "Bank of Baroda", "Bank of India", "Bank of Maharashtra", "Bassein Catholic CoOperative Bank",
  "bharat bank", "Can Fin Homes", "Canara Bank", "capital india finance", "capri global housing finance", "Central Bank of India", "CFM Asset Reconstruction",
  "Cholamandalam Investment and Finance Company", "citizencredit cooperative bank", "Cosmos Bank", "DCB Bank", "Debts Recovery Tribunal", "deccan merchants coop. bank",
  "Deutsche Bank", "Dhanlaxmi Bank Limited", "dmi housing finance", "dns bank", "dnyandeep co operative credit society", "ecl finance", "Edelweiss ARC",
  "encore asset reconstruction company", "Equitas Small Finance Bank", "Federal Bank", "GIC Housing Finance", "greater bombay cooperative bank", "Grihum Housing Finance",
  "HDFC Bank", "Hinduja Housing Finance", "HomeFirst Finance", "ICICI Bank", "ICICI Home Finance Company", "IDBI Bank", "IDFC FIRST Bank", "iifl home finance", "Indian Bank",
  "Indian Overseas Bank", "International Asset Reconstruction Company", "invent assets securitisation", "ISARC", "Jana Small Finance Bank", "Karnataka Bank",
  "karvy financial services", "Kotak Mahindra Bank", "L&T Finance", "LIC HOUSING FINANCE LIMITED", "Liquidation", "model cooperative bank", "Mogaveera Co-operative Bank",
  "Motilal Oswal Home Finance Ltd", "mumbai district cooperative housing federation", "Muthoot Homefin", "Muthoot Housing Finance Company", "nido home finance", "Omkara ARC",
  "orix leasing and financial services india", "padmavati sahakari patpedhi maryadit", "Pegasus Assets Reconstruction", "Phoenix ARC", "Piramal Capital & Housing Finance",
  "PNB Housing Finance", "prasaditya arc", "Punjab & Sind Bank", "Punjab National Bank", "reform arc", "religare finvest", "Sammaan Capital Ltd", "Saraswat Bank",
  "shri mahagangadevi sahakari patsanstha", "shriram asset reconstruction", "smfg india credit company", "SMFG India Home Finance", "South Indian Bank", "Standard Chartered",
  "State Bank of India", "svatantra micro housing finance corporation", "Tamilnad Mercantile Bank", "Tata Capital Housing Finance", "tjsb sahakari bank", "truhome finance",
  "Tyger Home Finance", "U GRO Capital", "UCO Bank", "Ujjivan Small Finance Bank", "Union Bank of India", "vastu housing finance corporation", "Yes Bank",
];

/** "Liquidation" is a category / status of a sale, not a financial institution: reported separately and never matched to a bank. */
export const CATEGORY_ENTRIES: readonly string[] = ["Liquidation"];

const LEGAL_SUFFIX = /\b(limited|ltd|pvt|private|p ltd)\b/g;

/** Case, "&" / "and", punctuation, legal suffixes, "co-operative" and "asset reconstruction company" spelled one way. Deterministic and reversible by nobody: it is only used for equality. */
export function normalizeInstitution(raw: string): string {
  let s = ` ${raw.toLowerCase()} `
    .replace(/&/g, " and ")
    .replace(/co[\s.-]*operative|coop\b\.?|co[\s-]op\b/g, " cooperative ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bassets? reconstruction( company| co)?\b/g, " arc ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^the /, "").replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Official name variations (a former or full legal name of the SAME entity). Each is used only as an exact, normalised equality, and the match is
 * reported as "alias" with the variation that matched. Nothing here is a guess about similar-sounding institutions.
 */
export const ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Acre India Arc": ["ACRE", "Assets Care and Reconstruction Enterprise"],
  "arcil": ["Asset Reconstruction Company (India)", "Arcil"],
  "Cosmos Bank": ["Cosmos Co-operative Bank"],
  "L&T Finance": ["L and T Finance", "L&T Finance Holdings"],
  "Standard Chartered": ["Standard Chartered Bank"],
  "Sammaan Capital Ltd": ["Indiabulls Housing Finance"],
  "smfg india credit company": ["Fullerton India Credit Company"],
  "SMFG India Home Finance": ["Fullerton India Home Finance"],
  "Piramal Capital & Housing Finance": ["Piramal Finance"],
  "Aadhar Housing Finance Ltd": ["Aadhar Housing Finance", "Aadhaar Housing Finance"],
  "Bank of Baroda": ["BoB"],
  "State Bank of India": ["SBI"],
};

export interface Match { original: string; method: "exact" | "normalized" | "alias"; via: string }

const origKeys = ORIGINAL_INSTITUTIONS.filter((o) => !CATEGORY_ENTRIES.includes(o)).map((o) => ({ original: o, key: normalizeInstitution(o) }));
const aliasKeys = Object.entries(ALIASES).flatMap(([original, list]) => list.map((a) => ({ original, alias: a, key: normalizeInstitution(a) })));

/**
 * Which original entries an eAuctionsIndia institution name equals. More than one entry is possible only if the list itself holds two entries that
 * normalise the same (reported by the caller as ambiguous); no entry means no match. Never substring.
 */
export function matchInstitution(name: string): Match[] {
  const key = normalizeInstitution(name);
  if (!key) return [];
  const out: Match[] = [];
  for (const o of origKeys) if (o.key === key) out.push({ original: o.original, method: o.original.toLowerCase() === name.trim().toLowerCase() ? "exact" : "normalized", via: name.trim() });
  for (const a of aliasKeys) if (a.key === key && !out.some((m) => m.original === a.original)) out.push({ original: a.original, method: "alias", via: a.alias });
  return out;
}

export interface Evidence { name: string; url: string | null; source: "directory" | "saved_page_logo" | "saved_page_link"; file: string }

/** Institutions on a saved eAuctionsIndia page: every link to /bank/<slug> (the site's institution page) and every institution logo on a listing card. */
export function evidenceFromHtml(rawHtml: string, file: string): Evidence[] {
  const $ = cheerio.load(unwrapViewSource(rawHtml));
  const out: Evidence[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/^(?:https:\/\/www\.eauctionsindia\.com)?\/bank\/([a-z0-9-]+)\/?$/i);
    if (!m) return;
    const name = ($(a).text() || $(a).find("img").attr("alt") || "").replace(/\s+/g, " ").trim();
    if (name) out.push({ name, url: `https://www.eauctionsindia.com/bank/${m[1].toLowerCase()}`, source: "saved_page_link", file });
  });
  $("img.sbl").each((_, i) => { const name = ($(i).attr("alt") ?? "").replace(/\s+/g, " ").trim(); if (name) out.push({ name, url: null, source: "saved_page_logo", file }); });
  return out;
}

/** A saved institution DIRECTORY page: the /bank/<slug> links are the directory entries. */
export function parseDirectory(rawHtml: string, file: string): Evidence[] {
  return evidenceFromHtml(rawHtml, file).filter((e) => e.source === "saved_page_link").map((e) => ({ ...e, source: "directory" as const }));
}

export type MappingStatus = "CONFIRMED" | "MISSING" | "UNCERTAIN" | "CATEGORY";
export interface MappingRow { n: number; original: string; matched: string; url: string; status: MappingStatus; match: string; evidence: string }

/**
 * One row per original entry, exactly once. CONFIRMED needs a name that eAuctionsIndia shows (directory entry, institution link or logo).
 * MISSING needs a directory that was supplied AND declared complete; otherwise an unseen name is UNCERTAIN, never MISSING.
 */
export function buildMapping(evidence: Evidence[], opts: { directoryComplete: boolean; directoryFiles: string[] }): MappingRow[] {
  return ORIGINAL_INSTITUTIONS.map((original, i): MappingRow => {
    const n = i + 1;
    if (CATEGORY_ENTRIES.includes(original)) return { n, original, matched: "", url: "", status: "CATEGORY", match: "none", evidence: "A category / status of a sale, not a financial institution: not matched to any institution and not counted as a bank." };
    const hits = evidence.map((e) => ({ e, m: matchInstitution(e.name).find((x) => x.original === original) })).filter((h): h is { e: Evidence; m: Match } => !!h.m);
    if (hits.length) {
      const best = hits.find((h) => h.e.url) ?? hits[0];
      const srcs = [...new Set(hits.map((h) => `${h.e.source} in ${h.e.file}`))].join("; ");
      return { n, original, matched: best.e.name, url: best.e.url ?? "", status: "CONFIRMED", match: best.m.method + (best.m.method === "alias" ? ` (${best.m.via})` : ""), evidence: `Shown by eAuctionsIndia: ${srcs}.${best.e.url ? "" : " No directory URL was seen for it (logo only)."}` };
    }
    if (opts.directoryComplete && opts.directoryFiles.length) return { n, original, matched: "", url: "", status: "MISSING", match: "none", evidence: `Not in the supplied directory (${opts.directoryFiles.join(", ")}), which was declared complete.` };
    return { n, original, matched: "", url: "", status: "UNCERTAIN", match: "none", evidence: opts.directoryFiles.length ? `Not found in the supplied directory file(s) (${opts.directoryFiles.join(", ")}), which was NOT declared complete: absence is not proven.` : "No eAuctionsIndia institution directory was supplied or reachable (automated access is refused by Cloudflare), so availability is not verified either way." };
  });
}

const csvCell = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
export const mappingToCsv = (rows: MappingRow[]) => ["n,original_name,matched_official_name,directory_url,status,match_type,evidence_notes", ...rows.map((r) => [r.n, r.original, r.matched, r.url, r.status, r.match, r.evidence].map(csvCell).join(","))].join("\n") + "\n";

export function mappingToTxt(rows: MappingRow[], status: MappingStatus | MappingStatus[]): string {
  const want = Array.isArray(status) ? status : [status];
  const sel = rows.filter((r) => want.includes(r.status));
  return `${sel.length} of ${rows.length}\n` + sel.map((r) => `${r.n}. ${r.original}${r.matched ? `  ->  ${r.matched}` : ""}${r.status === "CATEGORY" ? "  [category / status, not an institution]" : ""}`).join("\n") + "\n";
}

/** The institution names a listing may carry that are verified: the matched official names of CONFIRMED rows plus their originals. */
export function verifiedInstitutionKeys(rows: MappingRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) if (r.status === "CONFIRMED") { keys.add(normalizeInstitution(r.original)); if (r.matched) keys.add(normalizeInstitution(r.matched)); }
  return keys;
}
