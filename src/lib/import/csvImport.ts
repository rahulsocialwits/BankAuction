import { PropertyCategory, PropertyStatus, type DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";
import { deriveAuctionStatusFromDates } from "@/lib/domain/deriveAuctionStatus";
import { auctionDateChanged, detectExplicitStatus, resolveAuctionStatus } from "@/lib/domain/resolveAuctionStatus";
import { recordAuctionStatusChange } from "@/lib/pipeline/auctionEvents";
import { decideSameProperty, formatMergeNote, titleOverlap, titleTokens, titlesSimilar, type MatchDecision } from "@/lib/pipeline/propertyIdentity";
import { observeListing } from "@/lib/pipeline/fieldObservations";
import { markSeen } from "@/lib/pipeline/lastSeen";
import { prismaLastSeenStore } from "@/lib/pipeline/lastSeenStore";
import { sourceLabelOf, type ExtractionMethod } from "@/lib/pipeline/fieldProvenance";
import { recordMerge } from "@/lib/pipeline/mergeLog";
import { canonicalBankKey, canonicalBankName, normalizeListing } from "./normalize";
import { removeListingFromSource } from "@/lib/pipeline/sourceRemoval";
import { isBlockedRecord } from "@/data-sources/feeds/blockedHosts";

/** Vehicles (cars, bikes, trucks, tractors …) are out of scope for this site. */
export function isVehicleListing(title: string, category?: string | null): boolean {
  if ((category ?? "").toUpperCase().replace(/[ &]+/g, "_") === "VEHICLE") return true;
  return (
    /\b(vehicles?|two[- ]?wheelers?|four[- ]?wheelers?|motor ?cycles?|scooters?|tractors?|trucks?|lorry|lorries)\b/i.test(title) ||
    /^\s*(car|bike|bus|jeep|suv|auto|tempo)\b/i.test(title) || // a title that starts with a vehicle word
    /\b(car|jeep|suv|bus|bike)\s*\(/i.test(title) // "Car (Honda City)"
  );
}

const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL", "VEHICLE"];
export const MAX_ROWS = 500;

export interface ImportResult {
  created: number;
  skipped: number; // already on the site (duplicates)
  failed: number;
  updated?: number; // of those, listings whose missing details were filled in or corrected
  held?: number; // retained for reporting compatibility; listings are no longer held for missing borrower
  rejections?: { title: string; reasons: string[] }[]; // every rejected listing with its exact reason(s)
  reauctions?: number; // listings that were auctioned before: a NEW auction round was added to the existing property (no duplicate)
  stale?: number; // auctions that ended long ago and are not on the site: not added (existing ones are still corrected)
  error?: "header";
}

/** One listing; keys match the CSV template columns (lower-case). */
export type ListingRecord = Record<string, string | undefined>;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** Imports CSV text (header row + listings). Duplicate title+bank rows are skipped. */
export async function importCsvText(text: string, statusSource: string): Promise<ImportResult> {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  if (!header.includes("title")) return { created: 0, skipped: 0, failed: 0, error: "header" };
  const records = rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  return importRecords(records, statusSource, "PUBLISHED", undefined, { method: "csv" });
}

const tokens = titleTokens;
const similar = titlesSimilar;
const overlap = titleOverlap;

export interface Known { tokens: Set<string>; reserve: number | null; start: Date | null; auctionId: string; propertyId: string; ext: string | null; address?: string | null }

/** Source times are Indian Standard Time. A time written without an offset is IST, never "whatever the server's zone is". */
export function parseListingDate(s: string | undefined): Date | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(t) ? `${t.length === 16 ? t + ":00" : t}+05:30` : /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T11:00:00+05:30` : t;
  const d = new Date(withZone);
  return isNaN(d.getTime()) ? null : d;
}

const money = (v: string | undefined): number | null => {
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const yn = (v: string | undefined): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

type Doc = { type: string; title: string; url: string };
const docsOf = (rec: ListingRecord): Doc[] => {
  try {
    const list = JSON.parse(rec.documents ?? "[]") as Doc[];
    return Array.isArray(list) ? list.filter((d) => d && /^https?:\/\//i.test(d.url)) : [];
  } catch {
    return [];
  }
};

const mediaOf = (rec: ListingRecord): Doc[] => {
  try {
    const list = JSON.parse(rec.media ?? "[]") as Doc[];
    return Array.isArray(list) ? list.filter((m) => m && /^https?:\/\//i.test(m.url)) : [];
  } catch {
    return [];
  }
};

async function attachMedia(propertyId: string, media: Doc[]): Promise<boolean> {
  let added = false;
  for (const m of media.slice(0, 12)) {
    if (!m?.url) continue;
    const row = (await prisma.media.findFirst({ where: { sourceUrl: m.url } })) ?? (await prisma.media.create({
      data: { sourceUrl: m.url, type: "PHOTO" },
    }));
    const had = await prisma.propertyMedia.findUnique({ where: { propertyId_mediaId: { propertyId, mediaId: row.id } } });
    if (!had) {
      await prisma.propertyMedia.create({ data: { propertyId, mediaId: row.id, sortOrder: media.indexOf(m) } });
      added = true;
    }
  }
  return added;
}

async function attachDocuments(propertyId: string, docs: Doc[]): Promise<boolean> {
  let added = false;
  for (const d of docs.slice(0, 12)) {
    const document = await prisma.document.upsert({
      where: { sourceUrl: d.url },
      update: {},
      create: { sourceUrl: d.url, title: d.title?.slice(0, 120) || null, type: (DOC_TYPES.includes(d.type) ? d.type : "OTHER") as DocumentType },
    });
    const had = await prisma.propertyDocument.findUnique({ where: { propertyId_documentId: { propertyId, documentId: document.id } } });
    if (!had) {
      await prisma.propertyDocument.create({ data: { propertyId, documentId: document.id } });
      added = true;
    }
  }
  return added;
}

const DOC_TYPES = ["SALE_NOTICE", "AUCTION_NOTICE", "SALE_PROCLAMATION", "BID_FORM", "TERMS_AND_CONDITIONS", "PROPERTY_SCHEDULE", "POSSESSION_NOTICE", "DEMAND_NOTICE", "CORRIGENDUM", "INSPECTION_NOTICE", "APPLICATION_FORM", "OTHER"];

/** The auction columns a listing can fill (everything beyond title, bank and price). */
function auctionExtras(rec: ListingRecord) {
  const start = parseListingDate(rec.auction_start);
  const end = parseListingDate(rec.auction_end);
  return {
    externalAuctionId: rec.external_id || null,
    noticeNumber: rec.notice_number || null,
    auctionType: rec.auction_type || null,
    authorizedOfficer: rec.officer_name || null,
    officerPhone: rec.officer_phone || null,
    officerEmail: rec.officer_email || null,
    minimumIncrement: money(rec.minimum_increment),
    auctionEnd: end,
    applicationDeadline: parseListingDate(rec.application_deadline),
    inspectionDate: parseListingDate(rec.inspection_date),
    inspectionTime: rec.inspection_time || null,
    inspectionContact: rec.inspection_text || null,
    dscRequired: yn(rec.dsc_required),
    acceptReserveAsFirstBid: yn(rec.accept_reserve_first),
    autoExtension: yn(rec.auto_extension),
    extensionDurationMins: rec.extension_mins ? Number(rec.extension_mins) || null : null,
    extensionTrigger: rec.extension_trigger || null,
    status: resolveAuctionStatus({ current: null, derived: deriveAuctionStatusFromDates(start, end), explicit: detectExplicitStatus(rec.auction_status) }),
  };
}

/**
 * A listing that is already on the site: fill what is missing from the richer source and correct what is clearly wrong.
 *  - empty fields are filled; existing values are kept
 *  - a price/EMD that lost its unit ("₹2.51" for 2,51,000) is corrected
 *  - for auctions this same feed created: times (shifted by the old time-zone bug) and the status are corrected too
 *  - an address that still carries a "[Open in Google Maps →](…)" link is cleaned
 */
/** Existing listing still lacking its main details, and not deep-scanned before. */
async function isThin(hit: Known): Promise<boolean> {
  const a = await prisma.auction.findUnique({ where: { id: hit.auctionId }, select: { emd: true, auctionEnd: true } });
  if (!a || (a.emd && a.auctionEnd)) return false;
  const done = await prisma.propertyAttribute.findFirst({ where: { propertyId: hit.propertyId, key: "deep_scanned" }, select: { propertyId: true } });
  return !done;
}

export async function enrichExisting(hit: Known, rec: ListingRecord, statusSource: string, strong: boolean): Promise<boolean> {
  const [a, p] = await Promise.all([
    prisma.auction.findUnique({ where: { id: hit.auctionId } }),
    prisma.property.findUnique({ where: { id: hit.propertyId }, select: { status: true, addressText: true, latitude: true, longitude: true, description: true, attributes: { select: { key: true } } } }),
  ]);
  if (!a || !p) return false;
  // A different listing id is a different auction round of a similar-looking property: never mix its details in.
  if (rec.external_id && a.externalAuctionId && rec.external_id !== a.externalAuctionId) return false;
  if (!strong) {
    // Matched only by a similar title (two flats of one building read alike): the price or the auction time must back it up.
    const r = money(rec.reserve_price);
    const start = parseListingDate(rec.auction_start);
    const sameReserve = !!r && !!a.reservePrice && Number(a.reservePrice) === r;
    const contradicts = !!r && !!a.reservePrice && Number(a.reservePrice) >= 1000 && Number(a.reservePrice) !== r;
    const nearStart = !!start && !!a.auctionStart && Math.abs(start.getTime() - a.auctionStart.getTime()) < 36 * 3600_000;
    if (contradicts || (!sameReserve && !nearStart)) return false;
  }
  let changed = false;
  const mine = a.statusSource === statusSource;
  const x = auctionExtras(rec);
  const data: Record<string, unknown> = {};
  if (rec.branch && !a.branchId && a.bankId) {
    const branch = await prisma.bankBranch.upsert({ where: { bankId_name: { bankId: a.bankId, name: rec.branch } }, update: {}, create: { bankId: a.bankId, name: rec.branch } });
    data.branchId = branch.id;
  }
  const fill = (key: keyof typeof x, cur: unknown) => {
    const v = x[key];
    if (v !== null && v !== undefined && v !== "" && (cur === null || cur === undefined || cur === "")) data[key] = v;
  };
  fill("externalAuctionId", a.externalAuctionId);
  fill("noticeNumber", a.noticeNumber);
  fill("auctionType", a.auctionType);
  fill("authorizedOfficer", a.authorizedOfficer);
  fill("officerPhone", a.officerPhone);
  fill("officerEmail", a.officerEmail);
  fill("minimumIncrement", a.minimumIncrement);
  fill("auctionEnd", a.auctionEnd);
  fill("applicationDeadline", a.applicationDeadline);
  fill("inspectionDate", a.inspectionDate);
  fill("inspectionTime", a.inspectionTime);
  fill("inspectionContact", a.inspectionContact);
  fill("dscRequired", a.dscRequired);
  fill("acceptReserveAsFirstBid", a.acceptReserveAsFirstBid);
  fill("autoExtension", a.autoExtension);
  fill("extensionDurationMins", a.extensionDurationMins);
  fill("extensionTrigger", a.extensionTrigger);
  if (rec.auction_method && !a.auctionMethod) data.auctionMethod = rec.auction_method;
  if (rec.borrower && !a.borrower) data.borrower = rec.borrower;
  if (rec.possession_status && !a.possessionStatus) data.possessionStatus = rec.possession_status;
  const reserve = money(rec.reserve_price);
  const emd = money(rec.emd);
  if (reserve && (!a.reservePrice || (Number(a.reservePrice) < 1000 && reserve >= Number(a.reservePrice) * 100))) data.reservePrice = reserve;
  if (emd && (!a.emd || (Number(a.emd) < 1000 && emd >= Number(a.emd) * 100))) data.emd = emd;
  if (mine) {
    const start = parseListingDate(rec.auction_start);
    const same = (u: Date | null | undefined, v: Date | null | undefined) => (u ? u.getTime() : null) === (v ? v.getTime() : null);
    // a date more than 36 h away is another auction round (handled by addReauctionRound), not a correction of this one
    if (start && !same(a.auctionStart, start) && (!a.auctionStart || Math.abs(start.getTime() - a.auctionStart.getTime()) < ROUND_GAP_MS)) data.auctionStart = start;
    if (x.auctionEnd && !same(a.auctionEnd, x.auctionEnd)) data.auctionEnd = x.auctionEnd;
    const status = resolveAuctionStatus({
      current: a.status,
      derived: deriveAuctionStatusFromDates(start ?? a.auctionStart, x.auctionEnd ?? a.auctionEnd),
      explicit: detectExplicitStatus(rec.auction_status), // only a deliberate status field; free text is never scanned
      dateChanged: auctionDateChanged(a.auctionStart, start),
    });
    if (status !== a.status) {
      data.status = status;
      await recordAuctionStatusChange(a.id, a.status, status, "Source re-read: status updated");
    }
  } else if (!a.auctionStart) {
    const start = parseListingDate(rec.auction_start);
    if (start) data.auctionStart = start;
  }
  if (Object.keys(data).length) {
    await prisma.auction.update({ where: { id: a.id }, data });
    changed = true;
  }

  const pdata: Record<string, unknown> = {};
  const place = rec.location?.trim();
  if (place && (!p.addressText || /\]\(|google maps/i.test(p.addressText))) pdata.addressText = place;
  if (rec.latitude && rec.longitude && p.latitude === null && p.longitude === null) {
    pdata.latitude = Number(rec.latitude);
    pdata.longitude = Number(rec.longitude);
  }
  if (rec.description && !p.description) pdata.description = rec.description;
  if (Object.keys(pdata).length) {
    await prisma.property.update({ where: { id: hit.propertyId }, data: pdata });
    changed = true;
  }
  const have = new Set(p.attributes.map((t) => t.key));
  if (rec.legal_schedule && !have.has("legal_schedule")) {
    await prisma.propertyAttribute.create({ data: { propertyId: hit.propertyId, key: "legal_schedule", value: rec.legal_schedule } });
    changed = true;
  }
  if (rec.source_property_type && !have.has("source_property_type")) {
    await prisma.propertyAttribute.create({ data: { propertyId: hit.propertyId, key: "source_property_type", value: rec.source_property_type } });
    changed = true;
  }
  if (await attachDocuments(hit.propertyId, docsOf(rec))) changed = true;
  // A listing that was held back for a missing borrower name is published as soon as a later read finds the borrower.
  if (rec.borrower && p.status === "DRAFT" && have.has("enrichment_status")) {
    await prisma.property.update({ where: { id: hit.propertyId }, data: { status: "PUBLISHED" } });
    await prisma.propertyAttribute.deleteMany({ where: { propertyId: hit.propertyId, key: { in: ["enrichment_status", "borrower_status"] } } });
    await prisma.propertyChange.create({ data: { propertyId: hit.propertyId, field: "needs_enrichment", oldValue: "DRAFT", newValue: "Published: the borrower name was found" } }).catch(() => undefined);
    changed = true;
  }
  return changed;
}

const ROUND_GAP_MS = 36 * 3600_000;

/**
 * RE-AUCTION: the very same property (same bank, same title, same / similar price) listed again for a LATER date because it
 * did not sell. It stays ONE property; the new date becomes a new auction round (the newest round is the current one, the
 * earlier rounds are shown as "Previous auctions"). Returns true when a round was added.
 * Not a new round: the same listing id, a date within 36 hours of a known round (the same auction), a date that is not later
 * than the latest known round, or an existing round without a date.
 */
async function addReauctionRound(hit: Known, rec: ListingRecord, titleTokens: Set<string>, bankId: string | null, statusSource: string, sourceUrl: string | undefined): Promise<boolean> {
  const col = (k: string) => String(rec[k] ?? "").trim();
  const start = parseListingDate(col("auction_start"));
  if (!start || col("ended_long_ago") === "1") return false;
  const reserve = money(col("reserve_price"));
  if (!reserve) return false;
  // "100% the same property": a near-identical title, or the same price with a clearly overlapping title
  const same = similar(titleTokens, hit.tokens) || (reserve === hit.reserve && overlap(titleTokens, hit.tokens) >= 0.6);
  if (!same) return false;
  const rounds = await prisma.auction.findMany({ where: { propertyId: hit.propertyId }, select: { id: true, status: true, auctionStart: true, auctionEnd: true, externalAuctionId: true, reservePrice: true, emd: true } });
  if (!rounds.length) return false;
  if (rec.external_id && rounds.some((r) => r.externalAuctionId === rec.external_id)) return false;
  if (rounds.some((r) => r.auctionStart && Math.abs(r.auctionStart.getTime() - start.getTime()) < ROUND_GAP_MS)) return false;
  const dated = rounds.filter((r) => r.auctionStart) as (typeof rounds[number] & { auctionStart: Date })[];
  if (dated.length !== rounds.length) return false; // an earlier round without a date is filled by the normal update instead
  const latest = dated.reduce((a, b) => (a.auctionStart > b.auctionStart ? a : b));
  if (start.getTime() <= latest.auctionStart.getTime() + ROUND_GAP_MS) return false; // only a LATER date is a re-auction

  const x = auctionExtras(rec);
  let branchId: string | undefined;
  if (bankId && col("branch")) branchId = (await prisma.bankBranch.upsert({ where: { bankId_name: { bankId, name: col("branch") } }, update: {}, create: { bankId, name: col("branch") } })).id;
  await prisma.auction.create({
    data: {
      propertyId: hit.propertyId,
      bankId: bankId ?? undefined,
      branchId,
      borrower: col("borrower") || null,
      reservePrice: reserve,
      emd: money(col("emd")) ?? undefined,
      auctionStart: start,
      auctionMethod: col("auction_method") || null,
      possessionStatus: col("possession_status") || null,
      ...x,
      status: resolveAuctionStatus({ current: null, derived: deriveAuctionStatusFromDates(start, x.auctionEnd), explicit: detectExplicitStatus(rec.auction_status) }),
      statusSource,
      sourceUrl: col("source_url") || sourceUrl || null,
    },
  });
  // the earlier round is over: its status follows its own dates (completed / expired), the new round is the live one
  const prev = rounds.find((r) => r.id === latest.id)!;
  const prevStatus = resolveAuctionStatus({ current: prev.status, derived: deriveAuctionStatusFromDates(prev.auctionStart, prev.auctionEnd) });
  await recordAuctionStatusChange(prev.id, prev.status, prevStatus, "Superseded by a new auction round");
  await prisma.auction.update({ where: { id: prev.id }, data: { status: prevStatus } }).catch(() => undefined);
  const d = (v: Date | null) => (v ? v.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "—");
  await prisma.propertyChange.create({ data: { propertyId: hit.propertyId, field: "re_auction", oldValue: `${d(latest.auctionStart)} · ₹${latest.reservePrice ? Number(latest.reservePrice).toLocaleString("en-IN") : "—"}`, newValue: `New auction round ${d(start)} · ₹${reserve.toLocaleString("en-IN")}${col("emd") ? ` · EMD ₹${(money(col("emd")) ?? 0).toLocaleString("en-IN")}` : ""}` } }).catch(() => undefined);
  await attachDocuments(hit.propertyId, docsOf(rec)).catch(() => false);
  return true;
}

/** A notice (not a property) that an earlier shallow import published as one empty listing. */
const NOTICE_TITLE = /\b(auction|sale|e-?auction|public) notice\b|notice (for|of) (the )?(sale|e-?auction)/i;

/** Result of a deep scan of one listing (detail page + notice PDFs read by the AI). */
export interface DeepOutcome {
  attempted: boolean; // false: the cap/time was reached, nothing was tried
  records: ListingRecord[]; // the full listing(s); more than one when a notice lists several properties
  reason?: string; // exact code when its page could not be read (render_timeout, http_403, captcha, detail_page_empty, parser_failed …)
}
export type DeepHook = (rec: ListingRecord, mode: "new" | "backfill") => Promise<DeepOutcome>;

export async function importRecords(
  records: ListingRecord[],
  statusSource: string,
  propertyStatus: PropertyStatus,
  sourceUrl?: string,
  opts: {
    enrich?: boolean;
    /** Read the listing's own page and notices before it is created (new) or when an existing one is still thin (backfill). */
    deepen?: DeepHook;
    /** A listing must state a price or an auction date, and a place; otherwise it is rejected instead of published as "Not Available". */
    strict?: boolean;
    /** How the records were read (api, html, sheet, ...). Stored with each field observation (provenance). */
    method?: ExtractionMethod;
  } = {},
): Promise<ImportResult> {
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let updated = 0;
  let stale = 0;
  let reauctions = 0;
  let held = 0; // stored but not shown: the source does not state a borrower name (status DRAFT, needs_enrichment)
  const rejections: { title: string; reasons: string[] }[] = [];
  /** Listings this source showed in this call (last-seen tracking; flushed once at the end). */
  const seenIds = new Set<string>();
  /** A listing that is not imported always says exactly why. */
  const reject = (title: string, ...reasons: string[]) => {
    failed++;
    if (rejections.length < 300) rejections.push({ title: title.slice(0, 100), reasons });
  };
  // Existing listings per bank (loaded once per run), extended as new ones are created,
  // so duplicates inside the same batch and across sources are both caught.
  const knownByBank = new Map<string, Known[]>();
  async function known(bankId: string | null): Promise<Known[]> {
    const key = bankId ?? "none";
    let list = knownByBank.get(key);
    if (!list) {
      const rows = await prisma.auction.findMany({
        where: { bankId },
        select: { id: true, propertyId: true, externalAuctionId: true, reservePrice: true, auctionStart: true, property: { select: { title: true, addressText: true } } },
        take: 20000,
      });
      list = rows.map((r) => ({
        tokens: tokens(r.property.title),
        reserve: r.reservePrice ? Number(r.reservePrice) : null,
        start: r.auctionStart,
        auctionId: r.id,
        propertyId: r.propertyId,
        ext: r.externalAuctionId,
        address: r.property.addressText,
      }));
      knownByBank.set(key, list);
    }
    return list;
  }
  const branchIds = new Map<string, string>();
  // One bank per real bank: "SBI", "State Bank Of India Ltd." and "State Bank of India" all resolve to the same row.
  let bankByKey: Map<string, { id: string; name: string }> | null = null;
  async function resolveBank(rawName: string) {
    if (!bankByKey) {
      bankByKey = new Map();
      for (const b of await prisma.bank.findMany({ select: { id: true, name: true } })) if (!bankByKey.has(canonicalBankKey(b.name))) bankByKey.set(canonicalBankKey(b.name), b);
    }
    const key = canonicalBankKey(rawName);
    const have = bankByKey.get(key);
    if (have) return have;
    const name = canonicalBankName(rawName);
    const b = await prisma.bank.upsert({ where: { name }, update: {}, create: { name, slug: slugify(name) } });
    bankByKey.set(key, b);
    return b;
  }

  const queue = records.slice(0, MAX_ROWS);
  for (let qi = 0; qi < queue.length; qi++) {
    const rec = normalizeListing(queue[qi]);
    const col = (name: string) => String(rec[name] ?? "").trim();
    let deepFail = ""; // why this listing's own page could not be read (shown in the rejection)
    let orphan: string | null = null; // a property whose auction could not be saved must not stay behind as an empty listing
    try {
      const title = col("title");
      // The project's do-not-fetch list applies to EVERY route into the database (link source, sheet, CSV, bulk import): such a listing is never stored.
      if (isBlockedRecord(rec, sourceUrl)) { reject(title, "source_on_do_not_fetch_list"); continue; }
      // Quality gate: a listing needs a title plus a bank or a location, otherwise it is noise.
      if (!title || title.length < 8 || (!col("bank") && !col("location"))) {
        reject(title, ...[!title || title.length < 8 ? "title_missing" : "", !col("bank") && !col("location") ? "address_missing" : ""].filter(Boolean));
        continue;
      }
      // This site does not list vehicles, whatever the source or the AI says.
      if (isVehicleListing(title, col("category"))) { reject(title, "invalid_property_type"); continue; }
      // Nor movables (machinery, jewellery, going-concern sales): real estate only.
      if (/\b(plant (and|&) machinery|machineries|machinery|jewel+ery|bullion|going concern)\b/i.test(`${title} ${col("source_property_type")}`)) { reject(title, "invalid_property_type"); continue; }

      const bankName = col("bank");
      const bank = bankName ? await resolveBank(bankName) : null;

      const reservePrice = Number(col("reserve_price").replace(/[₹,\s]/g, ""));
      const validStart = parseListingDate(col("auction_start"));
      const titleTokens = tokens(title);

      const list = await known(bank?.id ?? null);
      // The source's own listing id is the surest match (the built-in crawler stores the same id).
      // A source-qualified id ("src:<site>:<id>", set by the site readers) identifies the SAME listing on every visit: it is updated, never duplicated.
      const sourceQualified = col("external_id").startsWith("src:");
      const sameId = (opts.enrich || sourceQualified) && col("external_id") ? list.find((k) => k.ext === col("external_id")) : undefined;
      const matched: { d?: MatchDecision } = {}; // why the listing was matched (for the merge log)
      const hit =
        sameId ??
        list.find((k) => {
          const d = decideSameProperty(
            { tokens: titleTokens, reserve: reservePrice, start: validStart, address: col("location") || null, externalId: col("external_id") || null },
            { tokens: k.tokens, reserve: k.reserve, start: k.start, address: k.address, externalId: k.ext },
          );
          if (d.match) matched.d = d;
          return d.match;
        });
      if (hit) {
        seenIds.add(hit.propertyId);
        // A match made by evidence other than the source's own id is written to the property's history (rule, source, time).
        if (hit !== sameId && matched.d?.match && matched.d.rule !== "same_source_id") await recordMerge(hit.propertyId, "listing matched", formatMergeNote(matched.d.rule!, statusSource, `\"${title.slice(0, 120)}\" matched this property: ${matched.d.reason}`));
        // Same property listed again for a later date (it did not sell): add a new auction round instead of skipping or overwriting the old one.
        if (await addReauctionRound(hit, rec, titleTokens, bank?.id ?? null, statusSource, sourceUrl)) {
          reauctions++;
          updated++;
          skipped++;
          continue;
        }
        // What this source shows for the matched listing is kept as provenance, whether or not it changes the stored value.
        await observeListing({ propertyId: hit.propertyId, auctionId: hit.auctionId }, { reserve: reservePrice, start: validStart, address: col("location") }, { statusSource, method: opts.method, document: col("source_url") || sourceUrl });
        if ((opts.enrich || hit === sameId) && (await enrichExisting(hit, rec, statusSource, hit === sameId))) updated++;
        if (mediaOf(rec).length && (await attachMedia(hit.propertyId, mediaOf(rec)))) updated++;
        else if (opts.deepen && col("deep_done") !== "1" && (await isThin(hit))) {
          // Already on the site but still without EMD / end date: read its own page once and fill the gaps.
          const out = await opts.deepen(rec, "backfill");
          if (out.attempted) {
            if (NOTICE_TITLE.test(title)) {
              // A notice that was imported as one empty "property": its real lots become properties, the notice itself is removed.
              // Source-driven removal goes through the data-protection gate: while this source's latest run is flagged
              // anomalous, the notice stays published and nothing is split (it is read again after the source recovers).
              const removal = await removeListingFromSource(statusSource, {
                propertyId: hit.propertyId,
                field: "deep_scan",
                oldValue: "PUBLISHED",
                reason: `Removed: this was a notice${out.records.length ? ` listing ${out.records.length} separate properties (added on their own)` : " with no property details"}`,
              });
              if (removal.applied) queue.splice(qi + 1, 0, ...out.records.slice(0, 25));
              skipped++;
              continue;
            }
            if (out.records[0] && (await enrichExisting(hit, out.records[0], statusSource, false))) updated++;
            await prisma.propertyAttribute.create({ data: { propertyId: hit.propertyId, key: "deep_scanned", value: new Date().toISOString() } }).catch(() => undefined);
          }
        }
        skipped++;
        continue;
      }

      // An auction that ended long ago is not added as a new listing (an existing one was corrected above).
      if (col("ended_long_ago") === "1") { stale++; continue; }

      // New listing: read its own page and notices first. The result (one or several listings) goes through the same checks again.
      if (opts.deepen && col("deep_done") !== "1") {
        const out = await opts.deepen(rec, "new");
        if (out.attempted && out.records.length > 0) {
          queue.splice(qi + 1, 0, ...out.records.slice(0, 25));
          continue;
        }
        if (out.attempted && out.reason) deepFail = out.reason;
      }
      // A listing without a reserve price would show "Not Available" to visitors: it is not published until its price is known.
      if (opts.strict) {
        const why = [!col("reserve_price") ? "reserve_price_missing" : "", !(col("auction_start") || col("auction_end")) ? "auction_date_missing" : "", !col("location") && !col("legal_schedule") ? "address_missing" : ""].filter(Boolean);
        if (why.length) { reject(title, ...why, ...(deepFail ? [deepFail] : [])); continue; }
      }
      // Missing borrower never blocks publication. Keep the source facts as-is; do not invent a borrower.\n
      // Last look straight at the database (another source or a parallel run may have just added this property, under any
      // bank spelling). The same decision as above applies: the same reserve price alone is not evidence, so this only skips a
      // listing that carries the same address (or a distinctive identical title) as a stored one.
      if (reservePrice > 0) {
        const t = tokens(title);
        const near = await prisma.auction.findMany({ where: { reservePrice }, select: { id: true, propertyId: true, bankId: true, auctionStart: true, externalAuctionId: true, property: { select: { title: true, addressText: true } } }, take: 60 });
        let dupOf: { propertyId: string; d: MatchDecision } | null = null;
        for (const n of near) {
          if (col("external_id") && n.externalAuctionId && n.externalAuctionId !== col("external_id")) continue; // a different round
          const d = decideSameProperty(
            { tokens: t, reserve: reservePrice, start: validStart, address: col("location") || null, externalId: col("external_id") || null },
            { tokens: tokens(n.property.title), reserve: reservePrice, start: n.auctionStart, address: n.property.addressText, externalId: n.externalAuctionId },
          );
          if (d.match) { dupOf = { propertyId: n.propertyId, d }; break; }
        }
        if (dupOf) {
          if (dupOf.d.rule !== "same_source_id") await recordMerge(dupOf.propertyId, "listing matched", formatMergeNote(dupOf.d.rule!, statusSource, `\"${title.slice(0, 120)}\" matched this property: ${dupOf.d.reason}`));
          skipped++;
          continue;
        }
      }

      const base = slugify(title);
      const slug = (await prisma.property.findUnique({ where: { slug: base } })) ? `${base}-${Date.now()}-${created}` : base;
      const catRaw = col("category").toUpperCase().replace(/[ &]+/g, "_");
      const category = CATEGORIES.includes(catRaw) ? (catRaw as PropertyCategory) : undefined;
      const emd = Number(col("emd").replace(/[₹,\s]/g, ""));

      let branchId: string | undefined;
      if (bank && col("branch")) {
        const key = `${bank.id}|${col("branch")}`;
        branchId = branchIds.get(key) ?? (await prisma.bankBranch.upsert({ where: { bankId_name: { bankId: bank.id, name: col("branch") } }, update: {}, create: { bankId: bank.id, name: col("branch") } })).id;
        branchIds.set(key, branchId);
      }

      const property = await prisma.property.create({
        data: {
          slug,
          title,
          category,
          description: col("description") || null,
          addressText: col("location") || null,
          latitude: col("latitude") ? Number(col("latitude")) : undefined,
          longitude: col("longitude") ? Number(col("longitude")) : undefined,
          status: "PUBLISHED",
        },
      });
      orphan = property.id;
      const extras = auctionExtras(rec);
      const auction = await prisma.auction.create({
        data: {
          // (an auction that cannot be saved removes its property again, see the catch below)
          propertyId: property.id,
          bankId: bank?.id,
          branchId,
          borrower: col("borrower") || null,
          reservePrice: reservePrice > 0 ? reservePrice : undefined,
          emd: emd > 0 ? emd : undefined,
          auctionStart: validStart ?? undefined,
          auctionMethod: col("auction_method") || null,
          possessionStatus: col("possession_status") || null,
          ...extras,
          // Feeds that carry no end date keep the old behaviour (upcoming); with dates the status follows them.
          status: resolveAuctionStatus({ current: null, derived: validStart || extras.auctionEnd ? deriveAuctionStatusFromDates(validStart, extras.auctionEnd) : "UPCOMING", explicit: detectExplicitStatus(rec.auction_status) }),
          statusSource,
          sourceUrl: col("source_url") || sourceUrl || null,
        },
      });
      if (col("legal_schedule")) await prisma.propertyAttribute.create({ data: { propertyId: property.id, key: "legal_schedule", value: col("legal_schedule") } });
      if (col("source_property_type")) await prisma.propertyAttribute.create({ data: { propertyId: property.id, key: "source_property_type", value: col("source_property_type") } });
      await attachDocuments(property.id, docsOf(rec));
      await attachMedia(property.id, mediaOf(rec));
      if (!col("borrower")) {
        await prisma.propertyAttribute.create({ data: { propertyId: property.id, key: "borrower_status", value: "not_available_from_source" } });
      }
      orphan = null;
      seenIds.add(property.id);
      await observeListing({ propertyId: property.id, auctionId: auction.id }, { reserve: reservePrice, start: validStart, address: col("location") }, { statusSource, method: opts.method, document: col("source_url") || sourceUrl });
      list.push({ tokens: titleTokens, reserve: reservePrice > 0 ? reservePrice : null, start: validStart, auctionId: auction.id, propertyId: property.id, ext: col("external_id") || null });
      created++;
    } catch (e) {
      reject(String(rec.title ?? ""), `import_error: ${e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : "unknown"}`);
      if (orphan) {
        const id = orphan;
        await prisma.propertyAttribute.deleteMany({ where: { propertyId: id } }).catch(() => undefined);
        await prisma.propertyDocument.deleteMany({ where: { propertyId: id } }).catch(() => undefined);
        await prisma.auction.deleteMany({ where: { propertyId: id } }).catch(() => undefined);
        await prisma.property.delete({ where: { id } }).catch(() => undefined);
      }
    }
  }
  await markSeen(prismaLastSeenStore, sourceLabelOf(statusSource), seenIds); // never throws
  return { created, skipped, failed, updated, stale, reauctions, held, rejections };
}
