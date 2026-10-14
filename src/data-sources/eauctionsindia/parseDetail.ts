import * as cheerio from "cheerio";
import type { ListingRecord } from "@/lib/import/csvImport";
import { canonCity, titleCase } from "@/lib/pipeline/locations";
import { cleanMoney } from "@/data-sources/authorized/fieldMap";
import { EAUCTIONS_HOST, parseEauctionsDate, typeToCategory } from "./parse";
import { unwrapViewSource } from "./maharashtra";

/*
 * Parser for ONE eAuctionsIndia property DETAIL page (https://www.eauctionsindia.com/properties/<id>), built from the real page
 * https://www.eauctionsindia.com/properties/894455 (tests/fixtures/eauctionsindia-detail-894455.html, sanitized). It is separate from the
 * LIST-page parser (parse.ts). Only what the page contains is read:
 *   id         "Auction ID :# 894455" (must equal the id in <link rel="canonical"> /properties/<id>)
 *   title      <h1>; the record title follows the list parser ("<Type> for sale in <area>, <city>") so a listing and its detail page match
 *   labelled   <strong>Label : </strong><span>value</span> pairs: Bank Name, Reserve Price, EMD, Branch Name, Service Provider,
 *              Borrower Name, Asset Category, Auction Type, Property Type, Auction Start Date / End Time, Application Submission Date,
 *              Province/State, City/Town, Area/Town
 *   text       the Description card's first paragraph
 *   files      "Sale Notice n" links (documents)
 * The page has no pincode field: a pincode is read ONLY when the description itself says "Pincode-416 310", and is reported separately
 * (the importer has no pincode column). The contact person and phone are NOT read into the record (personal data; reported as present only).
 */

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const BASE = "https://www.eauctionsindia.com";

export interface EauctionsDetail {
  ok: boolean;
  /** Validation errors: when not empty, no record is produced. */
  errors: string[];
  id: string | null;
  canonicalUrl: string | null;
  sourceTitle: string;
  propertyType: string;
  assetCategory: string;
  auctionType: string;
  bank: string;
  branch: string;
  serviceProvider: string;
  borrower: string;
  reservePrice: string;
  emd: string;
  /** ISO (UTC) from India time; "" when the page gives none. The original text is kept in `raw`. */
  auctionStart: string;
  auctionEnd: string;
  applicationDeadline: string;
  state: string;
  city: string;
  area: string;
  description: string;
  pincodeFromDescription: string;
  noticeLinks: string[];
  contactPresent: boolean;
  raw: Record<string, string>;
  record: ListingRecord | null;
}

const empty = (errors: string[]): EauctionsDetail => ({
  ok: false, errors, id: null, canonicalUrl: null, sourceTitle: "", propertyType: "", assetCategory: "", auctionType: "", bank: "", branch: "", serviceProvider: "", borrower: "",
  reservePrice: "", emd: "", auctionStart: "", auctionEnd: "", applicationDeadline: "", state: "", city: "", area: "", description: "", pincodeFromDescription: "", noticeLinks: [],
  contactPresent: false, raw: {}, record: null,
});

export function parseEauctionsDetail(rawHtml: string): EauctionsDetail {
  let html: string;
  try { html = unwrapViewSource(rawHtml); } catch { return empty(["The file could not be read as HTML."]); }
  if (!html.trim()) return empty(["The file is empty."]);
  const $ = cheerio.load(html);
  const errors: string[] = [];

  const body = text($("body").text());
  if (/just a moment|enable javascript and cookies to continue|verify you are human|attention required/i.test(`${$("title").text()} ${body.slice(0, 600)}`) && !$("a.text-dark:contains('Auction ID')").length) {
    return empty(["This is a challenge / verification page, not a property page. Nothing was read."]);
  }

  const labelled = (label: string): string => {
    let out = "";
    $("strong").each((_, el) => {
      if (out) return;
      const l = text($(el).text()).replace(/\s*:\s*$/, "").toLowerCase();
      if (l !== label.toLowerCase()) return;
      const next = $(el).nextAll("span, a, p").first();
      out = text(next.length ? next.text() : $(el).parent().clone().children("strong").remove().end().text());
    });
    return out;
  };

  const idText = text($("a.text-dark.fw-bold, .list-id a").first().text()).match(/Auction ID\s*:?\s*#?\s*(\d+)/i)?.[1] ?? null;
  const canonicalHref = $("link[rel='canonical']").attr("href") ?? null;
  let canonicalUrl: string | null = null;
  let canonicalId: string | null = null;
  if (canonicalHref) {
    try {
      const u = new URL(canonicalHref, BASE);
      if (u.hostname.replace(/^www\./, "") !== EAUCTIONS_HOST) errors.push(`The canonical address is on ${u.hostname}, not ${EAUCTIONS_HOST}.`);
      else { canonicalId = u.pathname.match(/^\/properties\/(\d+)\/?$/)?.[1] ?? null; canonicalUrl = canonicalId ? `${BASE}/properties/${canonicalId}` : null; if (!canonicalId) errors.push("The canonical address is not a /properties/<id> page."); }
    } catch { errors.push("The canonical address is not a valid URL."); }
  } else errors.push("No canonical address on the page.");
  if (!idText) errors.push("No \"Auction ID\" on the page.");
  if (idText && canonicalId && idText !== canonicalId) errors.push(`Auction ID ${idText} does not match the canonical address id ${canonicalId} (wrong source URL).`);
  const id = idText ?? canonicalId;

  const sourceTitle = text($("h1").first().text());
  const propertyType = labelled("Property Type");
  const assetCategory = labelled("Asset Category");
  const auctionType = labelled("Auction Type");
  const bank = labelled("Bank Name");
  const branch = labelled("Branch Name");
  const serviceProvider = labelled("Service Provider");
  const borrower = labelled("Borrower Name");
  const reserveRaw = labelled("Reserve Price");
  const emdRaw = labelled("EMD");
  const startRaw = labelled("Auction Start Date");
  const endRaw = labelled("Auction End Time");
  const deadlineRaw = labelled("Application Subbmision Date") || labelled("Application Submission Date");
  const state = labelled("Province/State");
  const city = labelled("City/Town");
  const area = labelled("Area/Town");
  const description = text($(".card:has(h5:contains('Description')) .card-body p").first().text());
  const pin = description.match(/pin\s*code\s*[-:]?\s*(\d{3})\s?(\d{3})\b/i);
  const noticeLinks = $("li[id^='notice'] a[href^='http']").map((_, a) => $(a).attr("href") ?? "").get().filter((u) => /^https:\/\//i.test(u));
  const contactPresent = $("strong").filter((_, el) => /^contact details/i.test(text($(el).text()))).length > 0;

  const reserve = cleanMoney(reserveRaw);
  const emd = cleanMoney(emdRaw);
  const start = parseEauctionsDate(startRaw);
  const end = parseEauctionsDate(endRaw);
  const deadline = parseEauctionsDate(deadlineRaw);
  if (reserveRaw && !reserve) errors.push(`Reserve price "${reserveRaw}" could not be read.`);
  if (!reserve) errors.push("No reserve price.");
  if (startRaw && !start) errors.push(`Auction start "${startRaw}" is not a valid date.`);
  if (!city && !area) errors.push("No city or area.");
  if (!propertyType && !sourceTitle) errors.push("No property type or title.");

  const raw = { reservePrice: reserveRaw, emd: emdRaw, auctionStart: startRaw, auctionEnd: endRaw, applicationDeadline: deadlineRaw };
  const out: EauctionsDetail = {
    ok: errors.length === 0, errors, id, canonicalUrl, sourceTitle, propertyType, assetCategory, auctionType, bank, branch, serviceProvider, borrower,
    reservePrice: reserve ?? "", emd: emd ?? "", auctionStart: start, auctionEnd: end, applicationDeadline: deadline, state, city, area, description,
    pincodeFromDescription: pin ? `${pin[1]}${pin[2]}` : "", noticeLinks, contactPresent, raw, record: null,
  };
  if (!out.ok || !id || !canonicalUrl) return out;

  const place = [area, city].filter(Boolean).join(", ");
  const category = typeToCategory(propertyType, assetCategory);
  if (category === "EXCLUDED") { out.ok = false; out.errors.push(`Property type "${propertyType}" is not real estate; not imported.`); return out; }
  out.record = {
    title: `${propertyType || "Property"} for sale in ${place}`,
    bank,
    branch,
    category,
    location: place,
    geo_state: state,
    geo_city: city ? canonCity(city) : "",
    geo_locality: area ? titleCase(area.replace(/[.,;]+$/, "")) : "",
    description: description.slice(0, 1500),
    reserve_price: reserve ?? "",
    emd: emd ?? "",
    auction_start: start,
    auction_end: end,
    application_deadline: deadline,
    auction_type: auctionType,
    auction_method: "E-Auction",
    source_property_type: propertyType,
    borrower,
    external_id: `src:${EAUCTIONS_HOST}:${id}`,
    source_url: canonicalUrl,
    notice_number: id,
    ...(noticeLinks.length ? { documents: JSON.stringify(noticeLinks.map((url, i) => ({ type: "SALE_NOTICE", title: `Sale Notice ${i + 1}`, url }))) } : {}),
  };
  return out;
}
