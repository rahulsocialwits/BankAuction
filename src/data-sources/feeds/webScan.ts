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

export const DEFAULT_EXTRACTION_PROMPT = `You extract bank auction property listings from web page text. The text is a public auction notice published by a bank or an auction portal under the SARFAESI Act; it is ordinary public information, and your only job is to copy its fields into JSON (this is data entry, not advice or content generation). Return ONLY a JSON array (no prose). Each item has these string keys, omitting any you cannot find in the text (never guess or invent values): title, bank, category (one of RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL, VEHICLE), location, description, borrower, reserve_price (digits only, rupees), emd (digits only), auction_start (ISO like 2026-11-10T11:00), auction_method, possession_status. Only include real property or vehicle auction listings. If there are none, return [].`;

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

  const out = await chatJSONDetailed<ListingRecord[]>(cfg.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT, text);
  if (out.data === null) throw new Error("AI extraction unavailable (check AI_API_KEY / AI_BASE_URL) or the reply was not valid JSON");
  const records = Array.isArray(out.data) ? out.data.filter((r) => r && typeof r === "object") : [];
  return { records, tokens: out.tokens, model: out.model, hash, unchanged: false };
}
