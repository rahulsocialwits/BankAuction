import { createHash } from "node:crypto";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import type { ListingRecord } from "@/lib/import/csvImport";
import { fetchWithRetry, robotsSkipLine } from "@/lib/fetch/httpStatus";
import { robotsAllows } from "@/lib/fetch/robotsRules";

export const UA = "BankAuctionBot/1.0 (+https://auction.bizsocio.com)";

export type RobotsVerdict = "allowed" | "disallowed" | "unreachable";

/**
 * Minimal robots.txt check for our user agent.
 *  - "disallowed": the site's own rules say no (or it answers 401/403) — a real refusal.
 *  - "unreachable": the site did not answer properly (timeout, network error, 5xx). That says nothing about
 *    permission, so the caller must treat it as a temporary problem, never as a block.
 *  - 4xx (no robots file) or a page that is not a robots file at all = no rules = allowed.
 */
export async function robotsCheck(pageUrl: string, onLog: (line: string) => void = (l) => console.log(`[crawler] ${l}`)): Promise<RobotsVerdict> {
  const u = new URL(pageUrl);
  // robots.txt itself: a 429 / 503 gets the one polite retry (never "blocked"); 401 / 403 is a refusal.
  const out = await fetchWithRetry(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) }, { inspectBody: false, onLog });
  if (out.status === "unauthorized" || out.status === "forbidden") return "disallowed";
  const res = out.res;
  if (!res) return "unreachable";
  if (res.status >= 400 && res.status < 500 && res.status !== 429) return "allowed";
  if (!res.ok) return "unreachable";
  const decision = robotsAllows(await res.text(), pageUrl);
  if (!decision.allowed) onLog(robotsSkipLine(pageUrl, decision.rule));
  return decision.allowed ? "allowed" : "disallowed";
}

/**
 * Page chrome that carries no listings (menus, site header/footer, side bars, forms, embeds) is dropped before the text
 * is hashed or sent to the AI: fewer tokens, and a changing menu or footer no longer looks like "new content".
 * Only the site-level header (near the top, with a menu) and footer (near the bottom) are removed, never a card's own
 * header/footer. If too little text would remain, the caller falls back to the full text.
 */
function stripChrome(html: string): string {
  const len = html.length;
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, (m, at: number) => (at < len * 0.15 && /<nav\b/i.test(m) ? " " : m))
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, (m, at: number) => (at > len * 0.8 ? " " : m))
    .replace(/<(nav|aside|form|select|iframe)\b[\s\S]*?<\/\1>/gi, " ");
}

export function htmlToText(html: string): string {
  const full = convertHtml(html);
  const lean = convertHtml(stripChrome(html));
  return lean.length >= 300 && lean.length >= full.length * 0.4 ? lean : full;
}

function convertHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export const DEFAULT_EXTRACTION_PROMPT = `You extract bank auction property listings from web page text. The text is a public auction page published by a bank or an auction portal under the SARFAESI Act; it is ordinary public information, and your only job is to copy its fields into JSON (this is data entry, not advice or content generation). Return ONLY a JSON array (no prose). One item per property shown (a list page has many cards: return EVERY card, do not stop after the first ones).
Each item has these string keys, omitting any you cannot find in the text (never guess, never calculate, never copy a value from another card): title, bank, branch, category (one of RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL), location (area, city, state, pincode as written), description, borrower, reserve_price (digits only, rupees: "Rs. 25.5 Lakh" = 2550000, "1.2 Cr" = 12000000), emd (digits only), auction_start (day-first dates, ISO IST like 2026-11-10T11:00), auction_end, auction_method, possession_status, external_id (the listing / auction number printed on the card).
Labels to look for: Reserve / Upset / Base price, EMD / Earnest money, Auction date / E-auction on, Bank, Branch, Property address / Schedule. A card without a reserve price is still returned (the title and place are enough) but nothing is invented for it.
Only include real property auction listings (land, buildings, flats, houses, shops, offices, factories, plots). NEVER include vehicles (cars, bikes, trucks, tractors), machinery, gold or other movables; skip them completely. Ignore menus, filters, banners, adverts and "related" boxes. If there are none, return [].`;

export interface ScanResult {
  records: ListingRecord[];
  tokens: number;
  model: string;
  hash: string;
  unchanged: boolean; // page text identical to the previous scan: the AI was not called
}

/**
 * Page → listings. If the page text hash equals `previousHash` (or, for a list, any hash already processed, e.g. by
 * another source) the AI call is skipped entirely.
 */
export async function scanWebPage(html: string, previousHash?: string | string[] | null): Promise<ScanResult> {
  const cfg = await getAiConfig();
  const text = htmlToText(html).slice(0, cfg.maxPageChars);
  const hash = createHash("sha256").update(text).digest("hex");
  const known = Array.isArray(previousHash) ? previousHash : previousHash ? [previousHash] : [];
  if (known.includes(hash)) return { records: [], tokens: 0, model: cfg.model, hash, unchanged: true };

  const system =
    (cfg.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT) +
    (cfg.rules ? `\n\nStanding rules from the site owner (follow strictly; they override anything above):\n${cfg.rules}` : "");
  // A long page is cut into pieces that are read side by side. One huge request to a slow model can run past the
  // time limit ("operation was aborted due to timeout"); several small ones finish quickly and in parallel.
  const chunks = splitText(text, CHUNK_CHARS);
  let tokens = 0;
  let model = cfg.model;
  let ok = 0;
  let firstError: unknown;
  const found: ListingRecord[] = [];

  async function readChunk(chunk: string) {
    try {
      const out = await chatJSONDetailed<ListingRecord[]>(system, chunk);
      tokens += out.tokens;
      model = out.model;
      if (out.data === null) return;
      ok++;
      if (Array.isArray(out.data)) found.push(...out.data.filter((r) => r && typeof r === "object"));
    } catch (e) {
      firstError ??= e;
    }
  }
  for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map(readChunk));

  if (ok === 0) {
    if (firstError instanceof Error) throw firstError;
    throw new Error("AI extraction unavailable (check AI_API_KEY / AI_BASE_URL) or the reply was not valid JSON");
  }

  // The same listing can appear at a chunk boundary: keep one per title.
  const seen = new Set<string>();
  const records = found.filter((r) => {
    const k = String(r.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { records, tokens, model, hash, unchanged: false };
}

const CHUNK_CHARS = 12_000;

/** Splits on line breaks so a listing is rarely cut in half. */
function splitText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > size && cur) {
      parts.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line.slice(0, size);
  }
  if (cur) parts.push(cur);
  return parts;
}
