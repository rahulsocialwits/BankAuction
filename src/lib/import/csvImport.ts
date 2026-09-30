import { PropertyCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";

const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL", "VEHICLE"];
export const MAX_ROWS = 500;

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  error?: "header";
}

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
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of rows.slice(0, MAX_ROWS)) {
    try {
      const title = col(r, "title");
      if (!title) { failed++; continue; }

      const bankName = col(r, "bank");
      const bank = bankName
        ? await prisma.bank.upsert({ where: { name: bankName }, update: {}, create: { name: bankName, slug: slugify(bankName) } })
        : null;

      const dup = await prisma.property.findFirst({
        where: { title: { equals: title, mode: "insensitive" }, auctions: bank ? { some: { bankId: bank.id } } : undefined },
        select: { id: true },
      });
      if (dup) { skipped++; continue; }

      const base = slugify(title);
      const slug = (await prisma.property.findUnique({ where: { slug: base } })) ? `${base}-${Date.now()}-${created}` : base;
      const catRaw = col(r, "category").toUpperCase().replace(/[ &]+/g, "_");
      const category = CATEGORIES.includes(catRaw) ? (catRaw as PropertyCategory) : undefined;
      const reserve = Number(col(r, "reserve_price").replace(/[₹,\s]/g, ""));
      const emd = Number(col(r, "emd").replace(/[₹,\s]/g, ""));
      const start = col(r, "auction_start") ? new Date(col(r, "auction_start")) : null;

      const property = await prisma.property.create({
        data: {
          slug,
          title,
          category,
          description: col(r, "description") || null,
          addressText: col(r, "location") || null,
          status: "PUBLISHED",
        },
      });
      await prisma.auction.create({
        data: {
          propertyId: property.id,
          bankId: bank?.id,
          borrower: col(r, "borrower") || null,
          reservePrice: reserve > 0 ? reserve : undefined,
          emd: emd > 0 ? emd : undefined,
          auctionStart: start && !isNaN(start.getTime()) ? start : undefined,
          auctionMethod: col(r, "auction_method") || null,
          possessionStatus: col(r, "possession_status") || null,
          status: "UPCOMING",
          statusSource,
        },
      });
      created++;
    } catch {
      failed++;
    }
  }
  return { created, skipped, failed };
}
