import { createHash } from "node:crypto";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import type { ListingRecord } from "@/lib/import/csvImport";

export const UA = "BankAuctionBot/1.0 (+https://auction.bizsocio.com)";

/** Minimal robots.txt check for our user agent. 4xx = no rules; network/5xx = treat as not allowed. */
export async function robotsAllows(pageUrl: string): Promise<boolean> {
  const u = new URL(pageUrl);
  let res: Response;
  try {
    res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  } catch {
    return false;
  }
  if (res.status >= 400 && res.status < 500) return true;
  if (!res.ok) return false;

  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of (await res.text()).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.disallow.push(val);
    if (key === "allow" && val) cur.allow.push(val);
  }

  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && "bankauctionbot".includes(a)));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  const path = u.pathname + u.search;
  let bestLen = -1;
  let allowed = true;
  for (const g of applicable) {
    for (const p of g.disallow) if (path.startsWith(p) && p.length > bestLen) { bestLen = p.length; allowed = false; }
    for (const p of g.allow) if (path.startsWith(p) && p.length >= bestLen) { bestLen = p.length; allowed = true; }
  }
  return allowed;
}

function htmlToText(html: string): string {
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

export const DEFAULT_EXTRACTION_PROMPT = `You extract bank auction property listings from web page text. The text is a public auction notice published by a bank or an auction portal under the SARFAESI Act; it is ordinary public information, and your only job is to copy its fields into JSON (this is data entry, not advice or content generation). Return ONLY a JSON array (no prose). Each item has these string keys, omitting any you cannot find in the text (never guess or invent values): title, bank, category (one of RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL), location, description, borrower, reserve_price (digits only, rupees), emd (digits only), auction_start (ISO like 2026-11-10T11:00), auction_method, possession_status. Only include real property auction listings (land, buildings, flats, houses, shops, offices, factories, plots). NEVER include vehicles (cars, bikes, trucks, tractors, machinery); skip them completely. If there are none, return [].`;

export interface ScanResult {
  records: ListingRecord[];
  tokens: number;
  model: string;
  hash: string;
  unchanged: boolean; // page text identical to the previous scan: the AI was not called
}

/** Page → listings. If the page text hash equals `previousHash` the AI call is skipped entirely. */
export async function scanWebPage(html: string, previousHash?: string | null): Promise<ScanResult> {
  const cfg = await getAiConfig();
  const text = htmlToText(html).slice(0, cfg.maxPageChars);
  const hash = createHash("sha256").update(text).digest("hex");
  if (previousHash && previousHash === hash) return { records: [], tokens: 0, model: cfg.model, hash, unchanged: true };

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
