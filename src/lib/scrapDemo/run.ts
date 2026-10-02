import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/db/prisma";
import { robotsCheck, scanWebPage, UA } from "@/data-sources/feeds/webScan";
import { validateFeedUrl } from "@/data-sources/feeds/run";
import type { ListingRecord } from "@/lib/import/csvImport";
import { canonState } from "@/lib/queries/places";
import { titleCase } from "@/lib/pipeline/locations";
import { MOCK_RECORDS, SAMPLE_NOTICE } from "./sample";
import type { DemoRecord, DemoResult, DemoSourceType, DemoStep, StepState } from "./types";

/*
 * AI Python Scrap — DEMO (isolated).
 * Read-only use of existing code: robotsCheck, validateFeedUrl, scanWebPage (the existing Relay extraction), and
 * read-only lookups of Property for the duplicate warning. Nothing is written anywhere.
 */

const MAX_BYTES = 1_500_000;
const VEHICLE = /\b(vehicle|car|cars|bike|motorcycle|scooter|truck|tractor|two[- ]wheeler|four[- ]wheeler|innova|machinery)\b/i;
const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

class Refused extends Error {}
class Failed extends Error {}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

/** The demo only ever fetches public internet pages. */
async function assertPublicHost(host: string) {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Failed("Only public websites can be used in the demo.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Failed("The website address could not be found.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Failed("Only public websites can be used in the demo.");
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

function num(s: string | undefined): number | null {
  const n = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const dmyToIso = (s: string): string => {
  const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s.trim().slice(0, 40);
};

/** The slice of the source text that talks about this record: from where its location/title first appears to the next "Lot". */
function windowFor(text: string, r: ListingRecord): string {
  const lower = text.toLowerCase();
  const anchors = [String(r.location ?? "").split(",")[0], String(r.title ?? "").split(",")[0], String(r.title ?? "").slice(0, 30)].map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 4);
  for (const a of anchors) {
    const i = lower.indexOf(a);
    if (i >= 0) {
      const next = lower.indexOf("\nlot ", i + 5);
      return text.slice(i, next > 0 ? next : i + 900);
    }
  }
  return "";
}

/** Fields the existing extraction does not return (external reference, inspection date) are read from the source text by plain patterns. */
function derive(text: string, r: ListingRecord) {
  const w = windowFor(text, r);
  const ref = w.match(/(?:baanknet[^\n:]*|property id|bank reference|notice no\.?|reference no\.?)[^\n:]*:\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{3,})/i)?.[1] ?? null;
  const insp = w.match(/inspection[^:\n]*:\s*([^\n]+)/i)?.[1] ?? null;
  return { externalRef: ref, inspectionDate: insp ? dmyToIso(insp) : null };
}

function place(r: ListingRecord) {
  const loc = String(r.location ?? "");
  const hay = `${loc} ${r.title ?? ""} ${r.description ?? ""}`;
  const pincode = hay.match(/\b[1-9]\d{5}\b/)?.[0] ?? null;
  const st = STATES.find((s) => hay.toLowerCase().includes(s.toLowerCase())) ?? null;
  const parts = loc.split(",").map((p) => p.replace(/\b[1-9]\d{5}\b/, "").trim()).filter(Boolean);
  const rest = parts.filter((p) => !STATES.some((s) => s.toLowerCase() === p.toLowerCase()));
  const city = rest.length ? titleCase(rest[rest.length - 1]) : null;
  return { pincode, state: st ? canonState(st) : null, city };
}

async function duplicateOf(title: string | null, price: number | null): Promise<string | null> {
  if (!title) return null;
  try {
    const head = title.slice(0, 28);
    const hit = await prisma.property.findFirst({
      where: {
        OR: [
          { title: { equals: title, mode: "insensitive" } },
          ...(price ? [{ title: { startsWith: head, mode: "insensitive" as const }, auctions: { some: { reservePrice: price } } }] : []),
        ],
      },
      select: { title: true },
    });
    return hit?.title ?? null;
  } catch {
    return null;
  }
}

// Same do-not-fetch list as the existing pipeline (copied, not imported: that list is private to the existing code).
const DO_NOT_FETCH = ["baanknet.com", "auctionbazaar.com", "bankauction.co"];

async function collectUrl(raw: string) {
  let host = "";
  try { host = new URL(raw.trim()).hostname; } catch { /* validateFeedUrl reports it below */ }
  const listed = DO_NOT_FETCH.find((h) => host === h || host.endsWith("." + h));
  if (listed) throw new Refused(`REASON: project do-not-fetch list. "${host}" matches "${listed}", which this project never fetches (its terms/robots refuse automated copying). No request was sent.`);
  const v = validateFeedUrl(raw);
  if (!v.ok) throw new Refused(`REASON: ${v.reason}. Use a full https:// address.`);
  const u = new URL(v.url);
  await assertPublicHost(u.hostname);

  const verdict = await robotsCheck(u.toString());
  if (verdict === "disallowed") throw new Refused(`REASON: robots.txt. ${u.hostname}/robots.txt does not allow our crawler on ${u.pathname || "/"} (or it answers 401/403). Try another page of the site, or use pasted text.`);
  if (verdict === "unreachable") throw new Failed("The website did not answer properly (temporary problem). Try again later.");

  let res: Response;
  try {
    res = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,text/plain" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Failed("The website did not answer in time.");
  }
  if (res.status >= 300 && res.status < 400) throw new Failed("The page redirects somewhere else. The demo does not follow redirects; paste the final page address instead.");
  if (res.status === 401 || res.status === 403) throw new Refused(`REASON: HTTP ${res.status} from ${u.hostname}. The site refuses automated requests (anti-bot or login). The demo does not retry or work around this.`);
  if (!res.ok) throw new Failed(`The website answered HTTP ${res.status}.`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)/i.test(contentType)) throw new Failed(`Content type "${contentType || "unknown"}" is not supported in the demo (PDF and file upload come in the next phase).`);
  const body = (await res.text()).slice(0, MAX_BYTES);
  return { text: contentType.includes("html") ? htmlToText(body) : body, httpStatus: res.status, contentType };
}

export async function runDemo(input: { name: string; type: DemoSourceType; url: string; pasted: string; mock: boolean }): Promise<DemoResult> {
  const t0 = Date.now();
  const steps: DemoStep[] = [];
  const url = input.type === "url" ? input.url.trim() : null;
  const result: DemoResult = {
    status: "FAILED",
    reason: null,
    durationMs: 0,
    source: { name: input.name || "Demo source", type: input.type, url },
    steps,
    collected: { items: 0, chars: 0, lines: 0, httpStatus: null, contentType: null, preview: "" },
    extraction: { mode: "NONE", model: null, tokens: null },
    counts: { extracted: 0, ok: 0, incomplete: 0, rejected: 0, duplicates: 0 },
    records: [],
  };

  async function step<T>(state: StepState, fn: () => Promise<T> | T, note?: (v: T) => string): Promise<T> {
    const s = Date.now();
    try {
      const v = await fn();
      steps.push({ state, outcome: "done", ms: Date.now() - s, note: note?.(v) });
      return v;
    } catch (e) {
      steps.push({ state, outcome: e instanceof Refused ? "refused" : "failed", ms: Date.now() - s, note: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  try {
    steps.push({ state: "QUEUED", outcome: "done", ms: 0, note: "Demo run created in memory (nothing is stored)" });

    const col = await step(
      "COLLECTING",
      async () => {
        if (input.type === "sample") return { text: SAMPLE_NOTICE, httpStatus: null as number | null, contentType: "text/plain (built-in sample)" };
        if (input.type === "paste") {
          if (input.pasted.trim().length < 40) throw new Failed("Paste the notice text first (at least a few lines).");
          return { text: input.pasted.slice(0, MAX_BYTES), httpStatus: null as number | null, contentType: "text/plain (pasted)" };
        }
        if (!url) throw new Failed("Enter a source URL.");
        return collectUrl(url);
      },
      (c) => `${c.text.length.toLocaleString("en-IN")} characters collected${c.httpStatus ? ` (HTTP ${c.httpStatus})` : ""}`,
    );
    const text = col.text;
    result.collected = { items: 1, chars: text.length, lines: text.split("\n").length, httpStatus: col.httpStatus, contentType: col.contentType, preview: text.slice(0, 1200) };

    await step("NORMALIZING", () => (text.trim().length < 40 ? Promise.reject(new Failed("Almost no readable text was found on the page.")) : true), () => "Plain text ready (Source Package built in memory)");

    let raw: ListingRecord[] = [];
    const ex = await step(
      "EXTRACTING",
      async () => {
        if (input.mock && input.type === "sample") return { records: MOCK_RECORDS, mode: "MOCK" as const, model: null, tokens: null };
        const r = await scanWebPage(text); // the existing Relay extraction, called as it is
        return { records: r.records, mode: "AI" as const, model: r.model, tokens: r.tokens };
      },
      (e) => `${e.records.length} record(s) via ${e.mode === "AI" ? "the existing AI Admin extraction" : "MOCK sample response"}`,
    );
    raw = ex.records;
    result.extraction = { mode: ex.mode, model: ex.model, tokens: ex.tokens };

    const records = await step(
      "VALIDATING",
      async () => {
        const out: DemoRecord[] = [];
        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const price = num(r.reserve_price);
          const d = derive(text, r);
          const p = place(r);
          const isVehicle = VEHICLE.test(`${r.title ?? ""} ${r.description ?? ""} ${r.category ?? ""}`);
          const missing = [
            !r.title && "title",
            !r.bank && "bank",
            !r.category && "property type",
            !r.location && "address",
            !price && "reserve price",
            !r.auction_start && "auction date",
            !p.pincode && "pincode",
          ].filter(Boolean) as string[];
          const dup = isVehicle ? null : await duplicateOf(r.title ?? null, price);
          out.push({
            demoId: `DEMO-${String(i + 1).padStart(3, "0")}`,
            bank: r.bank ?? null,
            title: r.title ?? null,
            type: r.category ?? null,
            address: r.location ?? null,
            city: p.city,
            state: p.state,
            pincode: p.pincode,
            reservePrice: price,
            emd: num(r.emd),
            auctionDate: r.auction_start ?? null,
            inspectionDate: d.inspectionDate,
            source: result.source.name,
            sourceUrl: url,
            externalRef: d.externalRef,
            extractionStatus: isVehicle ? "REJECTED" : missing.length > 2 ? "INCOMPLETE" : "OK",
            missing,
            duplicateOf: dup,
            rejectedReason: isVehicle ? "Vehicle: vehicles are never imported" : null,
          });
        }
        return out;
      },
      (o) => `${o.length} record(s) checked: schema, vehicle rule, duplicates (read-only look at live properties)`,
    );

    result.records = records;
    result.counts = {
      extracted: records.length,
      ok: records.filter((r) => r.extractionStatus === "OK").length,
      incomplete: records.filter((r) => r.extractionStatus === "INCOMPLETE").length,
      rejected: records.filter((r) => r.extractionStatus === "REJECTED").length,
      duplicates: records.filter((r) => r.duplicateOf).length,
    };
    steps.push({ state: "REVIEW", outcome: "done", ms: 0, note: "Ready for review. Demo mode: there is no import button and nothing is written." });
    result.status = "COMPLETED";
  } catch (e) {
    result.status = e instanceof Refused ? "REFUSED" : "FAILED";
    result.reason = e instanceof Error ? e.message : String(e);
  }
  result.durationMs = Date.now() - t0;
  return result;
}
