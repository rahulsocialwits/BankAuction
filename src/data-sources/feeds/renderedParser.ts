import * as cheerio from "cheerio";
import { moneyNumber } from "@/lib/import/richRaw";
import type { ListingRecord } from "@/lib/import/csvImport";
import { htmlToText } from "./webScan";

/*
 * Deterministic reader of a RENDERED property page (a page whose HTML was produced by a browser, for example a BAANKNET detail
 * page). Such pages show "Label" and its value as consecutive lines, in tables, or in definition lists. This turns them into one
 * normalized object WITHOUT the AI (no tokens). Nothing is invented: a field the page does not show stays null and is listed in
 * `missing`. The AI reader is still used when this one cannot find the basics (title + reserve price).
 */

export interface RenderedProperty {
  sourceUrl: string;
  propertyId: string | null; // the bank's own property id
  auctionId: string | null;
  title: string | null;
  propertyType: string | null; // "Individual House"
  category: string | null; // RESIDENTIAL / COMMERCIAL / INDUSTRIAL / LAND_PLOT / AGRICULTURAL
  bankName: string | null;
  branch: string | null;
  borrowerName: string | null;
  borrowerStatus: "available" | "not_available_from_source";
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  reservePrice: number | null;
  emd: number | null;
  minimumIncrement: number | null;
  auctionStart: string | null; // ISO, IST (e.g. 2026-10-06T10:00:00)
  auctionEnd: string | null;
  emdDeadline: string | null;
  auctionDate: string | null; // yyyy-mm-dd
  auctionTime: string | null; // HH:MM
  possessionStatus: string | null;
  inspection: string | null;
  officerName: string | null;
  officerPhone: string | null;
  officerEmail: string | null;
  latitude: number | null;
  longitude: number | null;
  documents: { type: string; title: string; url: string }[];
  /** Fields the page does not show (each is a rejection / enrichment reason). */
  missing: string[];
}

const LABELS: [keyof RenderedProperty | "bankPropertyId" | "summary" | "ownership" | "titleDeed", RegExp][] = [
  ["auctionId", /^auction id$/i],
  ["bankPropertyId", /^bank property id$/i],
  ["propertyId", /^property id$/i],
  ["auctionStart", /^auction start( date)?( & time)?$/i],
  ["auctionEnd", /^auction end( date)?( & time)?$/i],
  ["emd", /^emd( amount)?$/i],
  ["emdDeadline", /^emd end( date)?( & time)?$/i],
  ["reservePrice", /^(reserve|upset|base) price( \(.*\))?$/i],
  ["minimumIncrement", /^(bid|minimum bid) increment|^incremental amount$/i],
  ["officerName", /^(authori[sz]ed )?officer'?s? name$/i],
  ["officerPhone", /^(officer'?s? )?(phone|mobile|contact)( no\.?| number)?$/i],
  ["officerEmail", /^(officer'?s? )?e-?mail( id)?$/i],
  ["borrowerName", /^borrower'?s?( name)?$|^name of (the )?borrower$/i],
  ["bankName", /^(bank|bank name|secured creditor)$/i],
  ["branch", /^(branch|branch name)$/i],
  ["address", /^(property )?address$/i],
  ["city", /^city$/i],
  ["district", /^district$/i],
  ["state", /^state$/i],
  ["pincode", /^pin ?code$/i],
  ["possessionStatus", /^possession( type| status)?$/i],
  ["inspection", /^(property )?inspection( date)?( & time)?$/i],
  ["summary", /^property summary$/i],
  ["ownership", /^ownership type$/i],
  ["titleDeed", /^title deed type$/i],
];

const SECTION_STOP = /^(property detail|auction detail|owner details|bank detail|view auction|contact us|image|other links|about .*|terms & conditions|privacy policy|disclaimer|help|faq|user manual)$/i;

const num = (v: string | null | undefined): number | null => {
  const n = Number(moneyNumber(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "06-10-2026 10:00:00" / "6 Oct 2026, 10:00 AM" / "2026-10-06T10:00" -> "2026-10-06T10:00:00" (IST, no offset). null when it is not a date. */
export function isoIst(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  let y: number, mo: number, d: number, hh = 11, mm = 0;
  if (m) {
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (m[4] !== undefined) { hh = +m[4]; mm = +m[5]; if (/pm/i.test(m[7] ?? "") && hh < 12) hh += 12; if (/am/i.test(m[7] ?? "") && hh === 12) hh = 0; }
  } else {
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!iso) return null;
    y = +iso[1]; mo = +iso[2]; d = +iso[3];
    if (iso[4] !== undefined) { hh = +iso[4]; mm = +iso[5]; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(hh)}:${p(mm)}:00`;
}

const CATEGORY: [RegExp, string][] = [
  [/agricultur|farm/i, "AGRICULTURAL"],
  [/industri|factory|warehouse/i, "INDUSTRIAL"],
  [/commercial|shop|office|showroom/i, "COMMERCIAL"],
  [/plot|land/i, "LAND_PLOT"],
  [/residential|flat|house|villa|apartment|bungalow/i, "RESIDENTIAL"],
];

/** Label / value pairs of the page: "Label" line followed by its value line(s), "Label: value", table rows and dl pairs. */
export function labelPairs(html: string, text?: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const $ = cheerio.load(html);
  $("tr").each((_, tr) => {
    const cells = $(tr).children("th,td").toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim());
    if (cells.length === 2 && cells[0] && cells[1]) out.push({ label: cells[0].replace(/:$/, ""), value: cells[1] });
  });
  $("dl").each((_, dl) => {
    const terms = $(dl).children("dt").toArray();
    for (const dt of terms) {
      const dd = $(dt).next("dd");
      const label = $(dt).text().replace(/\s+/g, " ").trim().replace(/:$/, "");
      const value = dd.text().replace(/\s+/g, " ").trim();
      if (label && value) out.push({ label, value });
    }
  });
  const lines = (text ?? htmlToText(html)).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const isLabel = (l: string) => LABELS.some(([, re]) => re.test(l.replace(/:$/, ""))) || SECTION_STOP.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const inline = l.match(/^([A-Za-z][A-Za-z '&./()-]{2,40}?)\s*:\s*(.+)$/);
    if (inline) out.push({ label: inline[1].trim(), value: inline[2].trim() });
    const bare = l.replace(/:$/, "");
    if (LABELS.some(([, re]) => re.test(bare)) && i + 1 < lines.length && !isLabel(lines[i + 1])) out.push({ label: bare, value: lines[i + 1] });
    const idInline = l.match(/^Property ID\s+(\S+)$/i);
    if (idInline) out.push({ label: "Property ID", value: idInline[1] });
  }
  return out;
}

/** `text` = the page text exactly as a browser lays it out (innerText); without it the text is derived from the HTML. */
export function parseRenderedProperty(html: string, sourceUrl: string, text?: string): RenderedProperty {
  const pairs = labelPairs(html, text);
  const get = (key: string): string | null => {
    const entry = LABELS.find(([k]) => k === key);
    if (!entry) return null;
    const hit = pairs.find((p) => entry[1].test(p.label));
    const v = hit?.value?.trim();
    return v && !/^(n\/?a|na|-|--|not available|null|none)$/i.test(v) ? v : null;
  };
  const $ = cheerio.load(html);
  const lines = (text ?? htmlToText(html)).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // title: the page heading, or the "<type> for sale in <place>" line
  const heading = [$("h1").first().text(), ...lines.filter((l) => /\b(for sale|in)\b.*\b[A-Z]/.test(l) && /\bfor sale in\b/i.test(l))].map((t) => t.replace(/\s+/g, " ").trim()).find((t) => t.length >= 8) ?? null;

  // "Individual House, Residential" style line gives type and category
  const typeLine = lines.find((l) => /^[A-Za-z /&-]{3,40},\s*(Residential|Commercial|Industrial|Agricultural|Land|Plot)\b/i.test(l)) ?? null;
  const propertyType = typeLine ? typeLine.split(",")[0].trim() : null;
  const catSource = `${typeLine ?? ""} ${heading ?? ""}`;
  const category = CATEGORY.find(([re]) => re.test(catSource))?.[1] ?? null;

  const latLng = html.match(/Latitude and Longitude\s*(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/i) ?? (text ?? htmlToText(html)).match(/Latitude and Longitude\s*(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/i);

  const start = isoIst(get("auctionStart"));
  const urlId = sourceUrl.match(/\/(?:auction|property)-detail\/(\d+)/)?.[1] ?? null;
  const borrower = get("borrowerName");
  const bankPropId = get("bankPropertyId");
  const address = get("address");
  const city = get("city");
  const district = get("district");
  const state = get("state");

  const docs: RenderedProperty["documents"] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!/\.(pdf|docx?)(\?|$)/i.test(href)) return;
    if (/client-document|user[-_ ]?manual|faq|privacy|terms/i.test(`${href} ${$(a).text()}`)) return; // site-wide documents, not this property's
    try { docs.push({ type: "SALE_NOTICE", title: $(a).text().replace(/\s+/g, " ").trim().slice(0, 100) || "Notice", url: new URL(href, sourceUrl).toString() }); } catch { /* skip */ }
  });

  const out: RenderedProperty = {
    sourceUrl,
    propertyId: bankPropId ?? get("propertyId"),
    auctionId: get("auctionId") ?? (/auction-detail/.test(sourceUrl) ? urlId : null),
    title: heading,
    propertyType,
    category,
    bankName: get("bankName"),
    branch: get("branch"),
    borrowerName: borrower,
    borrowerStatus: borrower ? "available" : "not_available_from_source",
    address,
    city,
    district,
    state,
    pincode: get("pincode")?.replace(/\D/g, "").slice(0, 6) || null,
    reservePrice: num(get("reservePrice")),
    emd: num(get("emd")),
    minimumIncrement: num(get("minimumIncrement")),
    auctionStart: start,
    auctionEnd: isoIst(get("auctionEnd")),
    emdDeadline: isoIst(get("emdDeadline")),
    auctionDate: start ? start.slice(0, 10) : null,
    auctionTime: start ? start.slice(11, 16) : null,
    possessionStatus: get("possessionStatus"),
    inspection: get("inspection"),
    officerName: get("officerName"),
    officerPhone: get("officerPhone")?.replace(/[^\d+, /-]/g, "").trim() || null,
    officerEmail: get("officerEmail"),
    latitude: latLng ? Number(latLng[1]) : null,
    longitude: latLng ? Number(latLng[2]) : null,
    documents: docs.slice(0, 12),
    missing: [],
  };
  const need: [string, unknown][] = [
    ["property_id_missing", out.propertyId ?? out.auctionId],
    ["title_missing", out.title],
    ["address_missing", out.address ?? out.city],
    ["reserve_price_missing", out.reservePrice],
    ["auction_date_missing", out.auctionStart],
    ["bank_missing", out.bankName],
    ["borrower_name_missing", out.borrowerName],
  ];
  out.missing = need.filter(([, v]) => v === null || v === undefined || v === "").map(([k]) => k);
  return out;
}

/** Enough to be a property on its own: the AI reader is only needed when this is false. */
export const isUsable = (p: RenderedProperty) => !!(p.title && p.reservePrice && (p.address || p.city) && p.bankName);

/** The importer's own listing format. `src:<host>:<id>` is a stable, source-qualified identity (re-reading the same property UPDATES it). */
export function toListingRecord(p: RenderedProperty): ListingRecord {
  const host = new URL(p.sourceUrl).hostname.replace(/^www\./, "");
  const identity = p.auctionId ?? p.propertyId;
  const place = [p.city, p.district && p.district !== p.city ? p.district : null, p.state, p.pincode].filter(Boolean).join(", ");
  return {
    title: p.title ?? "",
    bank: p.bankName ?? "",
    branch: p.branch ?? "",
    category: p.category ?? "",
    location: place || (p.address ?? "").slice(0, 200),
    description: [p.propertyType ? `${p.propertyType}${p.category ? ` (${p.category.toLowerCase().replace("_", " ")})` : ""}.` : "", p.propertyId ? `Bank property ID: ${p.propertyId}.` : ""].filter(Boolean).join(" "),
    borrower: p.borrowerName ?? "",
    reserve_price: p.reservePrice ? String(p.reservePrice) : "",
    emd: p.emd ? String(p.emd) : "",
    minimum_increment: p.minimumIncrement ? String(p.minimumIncrement) : "",
    auction_start: p.auctionStart ?? "",
    auction_end: p.auctionEnd ?? "",
    application_deadline: p.emdDeadline ?? "",
    inspection_text: p.inspection ?? "",
    auction_method: "E-Auction",
    possession_status: p.possessionStatus ?? "",
    officer_name: p.officerName ?? "",
    officer_phone: p.officerPhone ?? "",
    officer_email: p.officerEmail ?? "",
    latitude: p.latitude !== null ? String(p.latitude) : "",
    longitude: p.longitude !== null ? String(p.longitude) : "",
    legal_schedule: (p.address ?? "").slice(0, 900),
    source_property_type: p.propertyType ?? "",
    external_id: identity ? `src:${host}:${identity}` : "",
    source_url: p.sourceUrl,
    documents: JSON.stringify(p.documents),
    borrower_status: p.borrowerStatus,
    deep_done: "1",
  };
}
