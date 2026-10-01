import { PropertyCategory, PropertyStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";

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
  skipped: number;
  failed: number;
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
  return importRecords(records, statusSource, "PUBLISHED");
}

const STOP = new Set(["the", "a", "an", "of", "in", "at", "and", "for", "on", "to", "no", "near", "flat", "property", "situated", "bearing"]);

function tokens(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t)),
  );
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter) >= 0.8;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

interface Known { tokens: Set<string>; reserve: number | null; start: Date | null }

export async function importRecords(
  records: ListingRecord[],
  statusSource: string,
  propertyStatus: PropertyStatus,
  sourceUrl?: string,
): Promise<ImportResult> {
  let created = 0;
  let skipped = 0;
  let failed = 0;
  // Existing listings per bank (loaded once per run), extended as new ones are created,
  // so duplicates inside the same batch and across sources are both caught.
  const knownByBank = new Map<string, Known[]>();
  async function known(bankId: string | null): Promise<Known[]> {
    const key = bankId ?? "none";
    let list = knownByBank.get(key);
    if (!list) {
      const rows = await prisma.auction.findMany({
        where: { bankId },
        select: { reservePrice: true, auctionStart: true, property: { select: { title: true } } },
        take: 20000,
      });
      list = rows.map((r) => ({
        tokens: tokens(r.property.title),
        reserve: r.reservePrice ? Number(r.reservePrice) : null,
        start: r.auctionStart,
      }));
      knownByBank.set(key, list);
    }
    return list;
  }

  for (const rec of records.slice(0, MAX_ROWS)) {
    const col = (name: string) => String(rec[name] ?? "").trim();
    try {
      const title = col("title");
      // Quality gate: a listing needs a title plus a bank or a location, otherwise it is noise.
      if (!title || title.length < 8 || (!col("bank") && !col("location"))) { failed++; continue; }
      // This site does not list vehicles, whatever the source or the AI says.
      if (isVehicleListing(title, col("category"))) { failed++; continue; }

      const bankName = col("bank");
      const bank = bankName
        ? await prisma.bank.upsert({ where: { name: bankName }, update: {}, create: { name: bankName, slug: slugify(bankName) } })
        : null;

      const reservePrice = Number(col("reserve_price").replace(/[₹,\s]/g, ""));
      const startDate = col("auction_start") ? new Date(col("auction_start")) : null;
      const validStart = startDate && !isNaN(startDate.getTime()) ? startDate : null;
      const titleTokens = tokens(title);

      const list = await known(bank?.id ?? null);
      const isDup = list.some(
        (k) =>
          similar(titleTokens, k.tokens) ||
          // Same bank, same reserve price, same auction day = same property even if titled differently.
          (reservePrice > 0 && k.reserve === reservePrice && !!validStart && !!k.start && sameDay(validStart, k.start)) ||
          // Same bank and the very same reserve price with a clearly overlapping title: the AI sometimes words a
          // title differently from one run to the next, and many pages carry no auction date to compare.
          (reservePrice > 0 && k.reserve === reservePrice && overlap(titleTokens, k.tokens) >= 0.4),
      );
      if (isDup) { skipped++; continue; }
      list.push({ tokens: titleTokens, reserve: reservePrice > 0 ? reservePrice : null, start: validStart });

      const base = slugify(title);
      const slug = (await prisma.property.findUnique({ where: { slug: base } })) ? `${base}-${Date.now()}-${created}` : base;
      const catRaw = col("category").toUpperCase().replace(/[ &]+/g, "_");
      const category = CATEGORIES.includes(catRaw) ? (catRaw as PropertyCategory) : undefined;
      const emd = Number(col("emd").replace(/[₹,\s]/g, ""));

      const property = await prisma.property.create({
        data: {
          slug,
          title,
          category,
          description: col("description") || null,
          addressText: col("location") || null,
          status: propertyStatus,
        },
      });
      await prisma.auction.create({
        data: {
          propertyId: property.id,
          bankId: bank?.id,
          borrower: col("borrower") || null,
          reservePrice: reservePrice > 0 ? reservePrice : undefined,
          emd: emd > 0 ? emd : undefined,
          auctionStart: validStart ?? undefined,
          auctionMethod: col("auction_method") || null,
          possessionStatus: col("possession_status") || null,
          status: "UPCOMING",
          statusSource,
          sourceUrl: col("source_url") || sourceUrl || null,
        },
      });
      created++;
    } catch {
      failed++;
    }
  }
  return { created, skipped, failed };
}
