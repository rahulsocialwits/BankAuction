import * as cheerio from "cheerio";
import type { ListingRecord } from "@/lib/import/csvImport";
import { canonCityInState, titleCase } from "@/lib/pipeline/locations";
import { cleanMoney, normalizePropertyType } from "@/data-sources/authorized/fieldMap";

/*
 * Parser for ACRE's public "Assets for sale" page (https://www.acreindia.in/assets-for-sale). ACRE is an asset reconstruction company
 * that publishes its assets for sale; the site's robots.txt allows all crawlers ("User-agent: *", "Disallow:" empty).
 *
 * The selectors below were taken from the real page (12 Oct 2026), not guessed:
 *   a card      .prop-card, with the asset id in .btn-view[data-asset-id]
 *               .prop-type-chip (type), .card-city ("Surat, Gujarat"), .card-address, .card-meta-item (area),
 *               .arow with .arow-label "Auction Date" / "EMD Last Date" and .arow-val, .rsp-val (reserve price), .emd-val strong (EMD),
 *               img.prop-card-img (photo)
 *   its drawer  #detailsOverlay_<id>: .map_link (a Google Maps link carrying the exact latitude,longitude), .kv-table rows
 *               (Property Type, Area, State, City, Auction Type) and .docs-list .doc-item (document name + PDF link)
 *   paging      .pagination: "Showing 1 to 10 of 54 results" and a link whose text is "Next"
 *
 * PRIVACY: the page also shows the borrower's name and a loan account number. They are NEVER read here (owner decision D07: borrower
 * names are not displayed or sold).
 */

export const ACRE_HOST = "acreindia.in";
export const ACRE_LIST_URL = "https://www.acreindia.in/assets-for-sale";
export const ACRE_BANK = "ACRE (Asset Care & Reconstruction Enterprise)";

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * "15 October 2026" -> ISO. The page gives a DATE without a time, so the time is set to 12:00 India time: the day is right in every
 * time zone and no clock time is invented beyond that marker. Unreadable or absurd dates -> "".
 */
export function parseAcreDate(raw: string | undefined): string {
  const m = text(raw).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return "";
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const year = Number(m[3]);
  if (month < 0 || year < 2015 || year > 2100) return "";
  const d = new Date(Date.UTC(year, month, Number(m[1]), 6, 30)); // 12:00 IST = 06:30 UTC
  return d.getUTCMonth() === month ? d.toISOString() : "";
}

/** The exact point from a Google Maps link ("...maps?q=21.142834,73.046570"), only when it is a plausible point in India. */
export function parseMapLink(href: string | undefined): { lat: number; lng: number } | null {
  const m = (href ?? "").match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5 ? { lat, lng } : null;
}

export interface AcrePage {
  records: ListingRecord[];
  /** Cards that were found but could not be mapped (no id, price or place). */
  rejected: number;
  total: number | null;
  nextUrl: string | null;
}

export function parseAcrePage(html: string, pageUrl = ACRE_LIST_URL): AcrePage {
  const $ = cheerio.load(html);
  const records: ListingRecord[] = [];
  let rejected = 0;

  $(".prop-card").each((_, el) => {
    const card = $(el);
    const id = card.find(".btn-view[data-asset-id]").first().attr("data-asset-id")?.trim();
    const typeText = text(card.find(".prop-type-chip").first().text());
    const cityLine = text(card.find(".card-city").first().text()); // "Surat, Gujarat"
    const [cityRaw, stateRaw] = cityLine.split(",").map((x) => x.trim());
    const address = text(card.find(".card-address").first().text()).replace(/^"+|"+$/g, "").replace(/""/g, '"').trim();
    const reserve = cleanMoney(card.find(".rsp-val").first().text());
    if (!id || !cityRaw || !reserve) { rejected++; return; }

    const area = text(card.find(".card-meta-item").first().text());
    const dates: Record<string, string> = {};
    card.find(".arow").each((__, row) => {
      const label = text($(row).find(".arow-label").first().text()).toLowerCase();
      const val = text($(row).find(".arow-val").first().text());
      if (label && val) dates[label] = val;
    });

    // the drawer of this asset (same id): exact point, the table and the documents
    const drawer = $(`#detailsOverlay_${id}`);
    const point = parseMapLink(drawer.find("a.map_link").first().attr("href"));
    const kv: Record<string, string> = {};
    drawer.find(".kv-table tr").each((__, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 2) kv[text($(tds[0]).text()).toLowerCase()] = text($(tds[1]).text());
    });
    const state = text(kv["state"]) || stateRaw || "";
    const city = text(kv["city"]) || cityRaw;
    const type = text(kv["property type"]) || typeText;

    const docs: { type: string; title: string; url: string }[] = [];
    drawer.find(".docs-list .doc-item").each((__, item) => {
      const url = $(item).find("a[href]").first().attr("href")?.trim();
      const name = text($(item).find(".doc-name").first().text());
      if (url && /^https?:\/\//i.test(url)) docs.push({ type: /term|condition/i.test(name) ? "TERMS_AND_CONDITIONS" : /form/i.test(name) ? "BID_FORM" : "AUCTION_NOTICE", title: name || "Bid document", url });
    });
    const photo = card.find("img.prop-card-img").first().attr("src")?.trim();
    const media = photo && /^https?:\/\//i.test(photo) ? [{ type: "PHOTO", title: `${type} in ${city}`, url: photo }] : [];

    const category = normalizePropertyType(type);
    if (category === "EXCLUDED") { rejected++; return; }
    records.push({
      title: `${area ? area + " " : ""}${type} for sale in ${city}`.trim(),
      bank: ACRE_BANK,
      category: category ?? "",
      location: [address, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" ").slice(0, 600),
      geo_city: canonCityInState(city, state),
      geo_state: state ? titleCase(state) : "",
      description: address.slice(0, 1500),
      reserve_price: reserve,
      emd: cleanMoney(card.find(".emd-val strong").first().text()),
      auction_start: parseAcreDate(dates["auction date"]),
      application_deadline: parseAcreDate(dates["emd last date"]),
      auction_method: "E-Auction",
      legal_schedule: address,
      source_property_type: type,
      ...(point ? { latitude: String(point.lat), longitude: String(point.lng) } : {}),
      external_id: `src:${ACRE_HOST}:${id}`,
      source_url: `${pageUrl.split("#")[0].split("?")[0]}#asset-${id}`,
      documents: JSON.stringify(docs),
      media: JSON.stringify(media),
      borrower_status: "not_published",
    });
  });

  const totalM = text($(".pagination").first().text()).match(/of\s+(\d+)\s+results/i);
  let nextUrl: string | null = null;
  $(".pagination a[href]").each((_, a) => {
    if (!nextUrl && /next/i.test(text($(a).text()))) nextUrl = new URL($(a).attr("href")!, pageUrl).toString();
  });
  return { records, rejected, total: totalM ? Number(totalM[1]) : null, nextUrl };
}
