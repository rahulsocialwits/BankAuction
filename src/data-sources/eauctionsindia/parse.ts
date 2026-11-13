import * as cheerio from "cheerio";
import type { ListingRecord } from "@/lib/import/csvImport";
import { canonCity, titleCase } from "@/lib/pipeline/locations";
import { cleanMoney, normalizePropertyType } from "@/data-sources/authorized/fieldMap";

/*
 * Parser for eAuctionsIndia's category LIST pages (https://www.eauctionsindia.com/category/residential and /category/residential/<page>).
 * Built from a real page the site's operator-side contact supplied (tests/fixtures/eauctionsindia-residential-page1.html). Only what that
 * page really contains is read; nothing is guessed:
 *   a listing   a block that has a link /properties/<id> around an <h5> title
 *               type  = the <p class="text-dark me-4"> next to the tag icon ("Land", "House", "Land And Building")
 *               when  = the calendar item ("23-12-2026 02:00 PM") or the plain text "Upcoming Auction" (no date yet)
 *               who   = <img class="sbl" alt="..."> (an institution logo such as "Debts Recovery Tribunal"), present on some listings
 *               text  = the first <p> after the title (the site cuts it with "...")
 *               price = "Reserve Price : ₹1,10,00,000.00"
 *   headline    <h1> "125,451 Bank Residential Auctions"
 *   paging      a link with rel="next" and numbered page links
 * The list page has NO state, EMD, bank name text, coordinates or photo of the property (its pictures are generic stock images), so those
 * stay empty. The detail pages (/properties/<id>) are not read: no sample of one exists yet.
 */

export const EAUCTIONS_HOST = "eauctionsindia.com";
const BASE = "https://www.eauctionsindia.com";

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "23-12-2026 02:00 PM" (India time) -> ISO; anything else (including "Upcoming Auction") -> "". */
export function parseEauctionsDate(raw: string | undefined): string {
  const m = text(raw).match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  if (year < 2015 || year > 2100 || month < 1 || month > 12 || hour12 < 1 || hour12 > 12 || minute > 59) return "";
  const hour = (hour12 % 12) + (/pm/i.test(m[6]) ? 12 : 0);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return ""; // 31-02-2026 and the like
  return new Date(local.getTime() - 5.5 * 3600_000).toISOString(); // India time -> UTC
}

/** The site's own category decides only when the type word alone does not ("Land And Building" on the residential list is residential). */
export function typeToCategory(type: string, siteCategory: string): string {
  if (/\b(land|plot)\b/i.test(type) && !/building/i.test(type)) return "LAND_PLOT";
  if (/\b(house|flat|apartment|villa|bungalow)\b/i.test(type)) return "RESIDENTIAL";
  const n = normalizePropertyType(type);
  if (n === "EXCLUDED") return "EXCLUDED";
  const bySite = ({ residential: "RESIDENTIAL", commercial: "COMMERCIAL", industrial: "INDUSTRIAL", agricultural: "AGRICULTURAL" } as Record<string, string>)[siteCategory.toLowerCase()];
  return bySite ?? n ?? "";
}

export interface EauctionsPage {
  records: ListingRecord[];
  rejected: number;
  /** "125,451 Bank Residential Auctions" -> 125451 */
  headlineTotal: number | null;
  nextUrl: string | null;
  lastPage: number | null;
}

export function parseEauctionsPage(html: string, siteCategory = "residential"): EauctionsPage {
  const $ = cheerio.load(html);
  const records: ListingRecord[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  $("a[href^='/properties/']").has("h5").each((_, a) => {
    const link = $(a);
    const id = link.attr("href")?.match(/^\/properties\/(\d+)\b/)?.[1];
    const block = link.closest(".row.mb-3");
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = text(link.find("h5").first().text());
    const type = text(block.find("p.text-dark.me-4").first().text());
    const when = text(block.find(".fa-calendar-o").first().parent().text()) || "";
    const institution = text(block.find("img.sbl").first().attr("alt"));
    const description = text(link.parent().find("p").first().text());
    const reserve = cleanMoney(text(block.text()).match(/Reserve Price\s*:\s*([^A-Za-z]*)/i)?.[1]);
    const place = (title.match(/\sin\s(.+)$/i)?.[1] ?? "").trim(); // "Ghatkesar, Hyderabad"
    const [area, district] = place.split(",").map((x) => x.trim());
    if (!title || !reserve || !place) { rejected++; return; }
    const category = typeToCategory(type, siteCategory);
    if (category === "EXCLUDED") { rejected++; return; }

    records.push({
      title: `${type || "Property"} for sale in ${place}`,
      bank: institution,
      category,
      location: place,
      geo_city: district ? canonCity(district) : area ? canonCity(area) : "",
      geo_locality: district && area ? titleCase(area.replace(/[.,;]+$/, "")) : "",
      description: description.slice(0, 1500),
      reserve_price: reserve,
      auction_start: parseEauctionsDate(when),
      auction_method: "E-Auction",
      source_property_type: type,
      external_id: `src:${EAUCTIONS_HOST}:${id}`,
      source_url: `${BASE}/properties/${id}`,
      notice_number: id,
    });
  });

  const head = text($("h1").first().text()).match(/^([\d,]+)\s/);
  let nextUrl: string | null = null;
  const nextHref = $("a[rel='next']").first().attr("href");
  if (nextHref) nextUrl = new URL(nextHref, BASE).toString();
  const nums = $(".pagination a.page-link").map((_, el) => Number(text($(el).text()))).get().filter((n) => Number.isInteger(n) && n > 0);
  return { records, rejected, headlineTotal: head ? Number(head[1].replace(/,/g, "")) : null, nextUrl, lastPage: nums.length ? Math.max(...nums) : null };
}
