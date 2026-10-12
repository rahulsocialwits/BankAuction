import type { ListingRecord } from "@/lib/import/csvImport";
import { canonCityInState, titleCase } from "@/lib/pipeline/locations";
import { getPath } from "./jsonFeed";

/*
 * Maps one raw feed record onto the importer's listing record using a FIELD MAP given as configuration (listing key -> path in the raw
 * record). The real feed's field names are not known, so none are assumed. Values are validated, never invented: an unreadable price
 * or date becomes empty (and the importer decides), a missing id / title / link makes the record rejected.
 */

export type FieldMap = Partial<Record<
  "id" | "title" | "bank" | "branch" | "address" | "city" | "state" | "locality" | "pincode" | "propertyType" | "reservePrice" | "emd" | "auctionStart" | "auctionEnd" | "noticeNumber" | "url" | "description",
  string
>>;

export type NormalizedType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "LAND_PLOT" | "AGRICULTURAL" | "EXCLUDED" | null;

/**
 * Property type from the feed's own words. Vehicles, machinery, gold and other movables are EXCLUDED (this site lists real estate only);
 * words that say nothing return null (the importer then leaves the category open: it is never guessed).
 */
export function normalizePropertyType(raw: string | null | undefined): NormalizedType {
  const t = (raw ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/\b(vehicle|car|bike|scooter|truck|tractor|bus|auto|machinery|plant|scrap|gold|jewel+ery|ornament|stock|book debt|going concern)\b/.test(t)) return "EXCLUDED";
  if (/\b(agricultur|farm|orchard|paddy|crop)\w*/.test(t)) return "AGRICULTURAL";
  if (/\b(industrial|factory|warehouse|godown|shed|plant land)\b/.test(t)) return "INDUSTRIAL";
  if (/\b(commercial|shop|office|showroom|mall|hotel|building)\b/.test(t)) return "COMMERCIAL";
  if (/\b(plot|land|site|vacant)\b/.test(t) && !/\b(flat|apartment|house|villa)\b/.test(t)) return "LAND_PLOT";
  if (/\b(residential|flat|apartment|house|villa|bungalow|row house|penthouse|bhk)\b/.test(t)) return "RESIDENTIAL";
  return null;
}

/** "₹ 1,25,000.50" -> "125000.5"; anything that is not a positive number -> "". */
export function cleanMoney(v: unknown): string {
  const n = Number(String(v ?? "").replace(/[₹,\s]|rs\.?|inr/gi, ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
}

/** A date the feed gives (ISO or dd/mm/yyyy [hh:mm]) -> ISO string; unreadable or absurd -> "". */
export function cleanDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  const d = dmy ? new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 0), Number(dmy[5] ?? 0))) : new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  return y >= 2010 && y <= 2100 ? d.toISOString() : "";
}

const str = (v: unknown, max = 500) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, max));

/** Builds the mapper for one source. `host` makes the external id source-qualified ("src:<host>:<id>") like every other source. */
export function makeMapper(host: string, map: FieldMap): (raw: unknown) => ListingRecord | null {
  return (raw) => {
    const get = (k: keyof FieldMap) => (map[k] ? getPath(raw, map[k]) : undefined);
    const id = str(get("id"), 120);
    const url = str(get("url"), 500);
    const title = str(get("title"), 300) || str(get("description"), 120);
    if (!id || !url || !title) return null;
    const type = normalizePropertyType(str(get("propertyType")) || title);
    if (type === "EXCLUDED") return null;
    const state = str(get("state"), 60);
    const city = str(get("city"), 60);
    const address = [str(get("address"), 300), str(get("pincode"), 10)].filter(Boolean).join(" ").trim();
    return {
      title,
      bank: str(get("bank"), 140),
      branch: str(get("branch"), 140),
      category: type ?? "",
      location: address || [city, state].filter(Boolean).join(", "),
      geo_city: city ? canonCityInState(city, state) : "",
      geo_state: state ? titleCase(state) : "",
      geo_locality: str(get("locality"), 100) ? titleCase(str(get("locality"), 100)) : "",
      description: str(get("description"), 1500),
      reserve_price: cleanMoney(get("reservePrice")),
      emd: cleanMoney(get("emd")),
      auction_start: cleanDate(get("auctionStart")),
      auction_end: cleanDate(get("auctionEnd")),
      notice_number: str(get("noticeNumber"), 120),
      auction_method: "E-Auction",
      external_id: `src:${host}:${id}`,
      source_property_type: str(get("propertyType"), 100),
      source_url: url,
    };
  };
}
