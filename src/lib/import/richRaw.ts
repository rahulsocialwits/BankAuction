import { normalizeBankAuctionsRecord } from "@/data-sources/bankauctions/normalize";
import type { RawAuctionRecord, RawDocumentRef } from "@/data-sources/bankauctions/extract";
import { nullIfPlaceholder } from "@/lib/normalization/parsers";
import type { ListingRecord } from "./csvImport";

/**
 * "Raw Source Records" rows of the Phase-0 workbook -> a full listing (not just title and price).
 * The text in `raw_content` comes in three shapes, all read by code (no AI):
 *   A. a markdown table  | Label: | value |      (bankauctions.in)   -> the SAME normaliser the built-in crawler uses
 *   B. JSON  {"catalogue":…, "fields":{label: value}}                -> the same labels, so the same normaliser
 *   C. card text ("Auction reserve price ₹6,34,500", "## Property location …")  (banksauctions.com)
 * Times are Indian Standard Time and are handed on as exact instants (ISO with Z).
 */

const IST_MIN = 330;

/** "₹2.51 L", "₹1.2 Cr", "75 K", "₹35,00,000" -> "251000", "12000000", "75000", "3500000". Empty when there is no amount. */
export function moneyNumber(v: string | null | undefined): string {
  // Indian grouping (35,00,000) is plain digits once the commas are gone.
  const s = String(v ?? "").replace(/,/g, "").replace(/₹/g, " ").replace(/\brs\.?\b/gi, " ").trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(cr(?:ore)?s?|l(?:ac|akh)?s?|k)?\b/i);
  if (!m) return "";
  const unit = (m[2] ?? "").toLowerCase();
  const mult = unit.startsWith("cr") ? 1e7 : unit.startsWith("l") ? 1e5 : unit === "k" ? 1e3 : 1;
  const n = Math.round(parseFloat(m[1]) * mult);
  return n > 0 ? String(n) : "";
}

/** Removes markdown links / arrows from a text: "Surat · 394180 [Open in Google Maps →](https://…)" -> "Surat · 394180". */
export function cleanText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/→/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s·,;|-]+$/g, "")
    .trim();
}

/** Latitude/longitude out of a Google Maps link (…?q=21.01,73.15 or …/@21.01,73.15,15z). */
export function coordsFrom(text: string): { lat: string; lng: string } | null {
  const m = text.match(/[?&]q=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ?? text.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** An IST wall-clock moment -> ISO instant. */
export function istIso(y: number, mo: number, d: number, hh = 11, mm = 0): string {
  return new Date(Date.UTC(y, mo - 1, d, hh, mm) - IST_MIN * 60_000).toISOString();
}

/** "30 Sep 2026" + "12:00 PM" -> instant. Returns "" when the date is not understood. */
export function dateTimeIso(dateText: string, timeText = ""): string {
  const d = dateText.match(/(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})/) ;
  const dm = dateText.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  let y: number, mo: number, day: number;
  if (d) [day, mo, y] = [+d[1], MONTHS[d[2].toLowerCase()] ?? 0, +d[3]];
  else if (dm) [day, mo, y] = [+dm[1], +dm[2], +dm[3]];
  else return "";
  if (!mo) return "";
  const t = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let hh = 11, mm = 0;
  if (t) {
    hh = +t[1];
    mm = +t[2];
    if (t[3]?.toLowerCase() === "pm" && hh < 12) hh += 12;
    if (t[3]?.toLowerCase() === "am" && hh === 12) hh = 0;
  }
  return istIso(y, mo, day, hh, mm);
}

/** "Contact The Authorized Officer : Rahul Singh/EMAIL ID:rahul@x.co.in MOB NO. 9978336633 & 903394 1002" -> name, phone, email. */
export function parseOfficer(text: string | null | undefined): { name: string; phone: string; email: string } {
  const t = String(text ?? "");
  const email = t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "";
  const phone = t.match(/\b\d[\d ]{8,}\d\b/)?.[0]?.trim() ?? "";
  const name = (t.match(/Authori[sz]ed\s+Officer\s*:?\s*([^/,;|\d@]+)/i)?.[1] ?? "").replace(/\b(email|mob|mobile|ph|phone|contact|no)\b.*$/i, "").trim();
  return { name: name.slice(0, 80), phone, email };
}

const DOC_LABEL = /download|view|notice|form|annexure|corrigendum|terms|tender|process/i;

/** Names a document from its file name when the sheet only gives the address. */
function labelFromUrl(url: string): string {
  const f = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
  if (/sale[-_ ]?notice/.test(f)) return "Download English Sale Notice";
  if (/bid[-_ ]?form|annexure/.test(f)) return "Download Bid Form";
  if (/terms/.test(f)) return "Download Terms & Conditions";
  if (/possession/.test(f)) return "Download Possession Notice";
  if (/corrigendum/.test(f)) return "Download Corrigendum";
  if (/\.(jpg|jpeg|png)$/.test(f)) return "Download English Sale Notice";
  return "Download Notice";
}

/** Layout A: the markdown table. */
function fromTable(content: string, title: string): RawAuctionRecord {
  const fields: Record<string, string[]> = {};
  const documents: RawDocumentRef[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?):?\s*\|\s*(.*?)\s*\|\s*$/);
    if (!m) continue;
    const label = m[1].replace(/:\s*$/, "").trim();
    const value = m[2].trim();
    const link = value.match(/\[[^\]]*\]\((https?:[^)\s]+)\)/);
    if (link && DOC_LABEL.test(label)) {
      if (!/go to e-auction/i.test(label)) documents.push({ label, href: link[1] });
      continue;
    }
    if (!value || /^\\?-+$/.test(value.replace(/\\/g, ""))) continue;
    (fields[label] ??= []).push(value.replace(/\s+/g, " "));
  }
  return { title, fields, documents };
}

/** Layout B: JSON with a "fields" object. */
function fromJson(content: string, title: string, docUrls: string[]): RawAuctionRecord | null {
  try {
    const j = JSON.parse(content) as { fields?: Record<string, unknown> };
    if (!j.fields || typeof j.fields !== "object") return null;
    const fields: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(j.fields)) {
      const s = String(v ?? "").trim();
      if (s && !/^download\b/i.test(k) && k !== "Submit Application") fields[k] = [s];
    }
    return { title, fields, documents: docUrls.map((href) => ({ label: labelFromUrl(href), href })) };
  } catch {
    return null;
  }
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/** Everything a listing needs, as plain strings (the importer's ListingRecord, with extra keys). */
export function richRecordFromRow(row: string[], col: (name: string) => string): ListingRecord | null {
  const title = cleanText(col("raw_title"));
  if (!title) return null;
  const content = col("raw_content");
  const docUrls = col("raw_document_urls").split("|").map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));

  // A and B: the same normaliser the built-in crawler uses.
  let raw: RawAuctionRecord | null = null;
  if (content.trimStart().startsWith("|")) raw = fromTable(content, title);
  else if (content.trimStart().startsWith("{")) raw = fromJson(content, title, docUrls);
  if (raw) {
    // The table holds the notice links; the plain URL column fills in anything it lacks.
    for (const href of docUrls) if (!raw.documents.some((d) => d.href === href)) raw.documents.push({ label: labelFromUrl(href), href });
    const n = normalizeBankAuctionsRecord(raw);
    const officer = parseOfficer(n.contactDetailsRaw ?? col("raw_contact_information"));
    const inspection = n.inspectionContactRaw ?? "";
    const insp = inspection.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+at\s+(\d{1,2}:\d{2}\s*(?:am|pm)?))?/i);
    const times = [...inspection.matchAll(/(\d{1,2}:\d{2}\s*(?:am|pm))/gi)].map((m) => m[1]);
    const noticeNo = nullIfPlaceholder(raw.fields["Auction No"]?.[0]);
    return {
      title,
      bank: n.bankName ?? col("raw_bank"),
      category: n.category ?? "",
      location: cleanText(n.cityRaw ?? col("raw_location")),
      description: n.description ?? col("raw_description"),
      borrower: n.borrower ?? "",
      reserve_price: num(n.reservePrice) || moneyNumber(col("raw_reserve_price")),
      emd: num(n.emd) || moneyNumber(col("raw_EMD")),
      auction_start: iso(n.auctionStart) || dateTimeIso(col("raw_auction_date"), col("raw_auction_time")),
      auction_method: n.auctionMethod ?? "",
      possession_status: n.possessionStatus ?? "",
      source_url: col("source_listing_url") || col("source_url"),
      external_id: n.externalAuctionId ?? col("source_property_id"),
      notice_number: noticeNo ?? "",
      auction_type: n.auctionType ?? "",
      branch: n.branchName ?? "",
      officer_name: officer.name,
      officer_phone: officer.phone,
      officer_email: officer.email,
      minimum_increment: num(n.minimumIncrement),
      auction_end: iso(n.auctionEnd),
      application_deadline: iso(n.applicationDeadline),
      inspection_text: inspection,
      inspection_date: insp ? dateTimeIso(`${insp[2]} ${insp[1]} ${insp[3]}`, insp[4] ?? "") : "",
      inspection_time: times.length ? [...new Set(times)].slice(0, 2).join(" – ") : "",
      dsc_required: n.dscRequired === null ? "" : n.dscRequired ? "yes" : "no",
      accept_reserve_first: n.acceptReserveAsFirstBid === null ? "" : n.acceptReserveAsFirstBid ? "yes" : "no",
      auto_extension: n.autoExtension === null ? "" : n.autoExtension ? "yes" : "no",
      extension_mins: num(n.extensionDurationMins),
      extension_trigger: n.extensionTrigger ?? "",
      legal_schedule: n.legalSchedule ?? "",
      source_property_type: n.rawPropertyType ?? col("raw_property_type"),
      documents: JSON.stringify(n.documents.map((d) => ({ type: d.type, title: d.title, url: d.sourceUrl }))),
    };
  }

  // C: card text.
  if (/Auction reserve price/i.test(content)) return fromCards(content, title, col);

  // Anything else (a partial record): the plain columns only.
  return {
    title,
    bank: col("raw_bank"),
    category: "",
    location: cleanText(col("raw_location")),
    description: col("raw_description"),
    reserve_price: moneyNumber(col("raw_reserve_price")),
    emd: moneyNumber(col("raw_EMD")),
    auction_start: dateTimeIso(col("raw_auction_date"), col("raw_auction_time")),
    possession_status: nullIfPlaceholder(col("raw_possession")) ?? "",
    source_url: col("source_listing_url") || col("source_url"),
    external_id: col("source_property_id"),
    source_property_type: col("raw_property_type"),
  };
}

/** The line after a label line ("EMD" / blank / "₹63,450"). */
function valueAfter(content: string, label: string): string {
  const m = content.match(new RegExp(`(?:^|\\n)${label}\\s*\\n+\\s*([^\\n]+)`, "i"));
  return m ? m[1].trim() : "";
}

function section(content: string, heading: string): string {
  const m = content.match(new RegExp(`##\\s*${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|$)`, "i"));
  return m ? m[1].trim() : "";
}

function fromCards(content: string, title: string, col: (name: string) => string): ListingRecord {
  const dateText = valueAfter(content, "Auction date") || col("raw_auction_date");
  const timeText = valueAfter(content, "Auction time") || col("raw_auction_time");
  const times = [...timeText.matchAll(/(\d{1,2}:\d{2}\s*(?:am|pm))/gi)].map((m) => m[1]);
  const startIso = dateTimeIso(dateText, times[0] ?? "");
  const endIso = times[1] ? dateTimeIso(dateText, times[1]) : "";

  const locBlock = section(content, "Property location");
  const coords = coordsFrom(locBlock) ?? coordsFrom(col("raw_location"));
  const place = cleanText(col("raw_location") || locBlock.split("\n").filter((l) => l.trim() && !l.startsWith("[")).join(", "));

  const inspect = content.match(/Inspect\s*\n+\s*(\d{1,2}\s+[A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*–\s*(\d{1,2}:\d{2}\s*[AP]M))?/i);
  const year = dateText.match(/\d{4}/)?.[0] ?? "";
  const proc = (label: string) => content.match(new RegExp(`${label}\\s*(Yes|No)`, "i"))?.[1]?.toLowerCase() ?? "";
  const reserve = content.match(/Auction reserve price\s*(₹?\s*[\d,.]+\s*(?:Cr|L|K)?)/i)?.[1] ?? col("raw_reserve_price");
  const subtype = content.match(/Subtype\s*([A-Za-z][A-Za-z &/]*?)(?=\n|Title|$)/)?.[1]?.trim() ?? "";
  const area = valueAfter(content, "Area");
  const description = section(content, "Property description") || col("raw_description");
  const possession = valueAfter(content, "Possession") || col("raw_possession");

  return {
    title,
    bank: col("raw_bank"),
    category: "",
    location: place,
    description: [description, area ? `Area: ${area}` : ""].filter(Boolean).join(" · "),
    reserve_price: moneyNumber(reserve),
    emd: moneyNumber(valueAfter(content, "EMD") || col("raw_EMD")),
    auction_start: startIso,
    auction_end: endIso,
    minimum_increment: moneyNumber(valueAfter(content, "Bid increment")),
    possession_status: nullIfPlaceholder(possession) ?? "",
    auction_method: "E-Auction",
    auction_type: content.match(/Auction type\s*([A-Za-z ]+?)(?=\n|$)/i)?.[1]?.trim() ?? "",
    source_url: col("source_listing_url") || col("source_url"),
    external_id: "",
    inspection_text: inspect ? `${inspect[1]} · ${inspect[2]}${inspect[3] ? ` – ${inspect[3]}` : ""}` : "",
    inspection_date: inspect && year ? dateTimeIso(`${inspect[1]} ${year}`, inspect[2]) : "",
    inspection_time: inspect ? `${inspect[2]}${inspect[3] ? ` – ${inspect[3]}` : ""}` : "",
    auto_extension: proc("Auto extension"),
    accept_reserve_first: proc("Reserve as first bid"),
    latitude: coords?.lat ?? "",
    longitude: coords?.lng ?? "",
    source_property_type: subtype || col("raw_property_type"),
    legal_schedule: "",
    documents: JSON.stringify(
      col("raw_document_urls").split("|").map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)).map((url) => ({ type: "OTHER", title: labelFromUrl(url).replace(/^Download /, ""), url })),
    ),
  };
}
