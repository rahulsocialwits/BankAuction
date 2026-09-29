import * as cheerio from "cheerio";

export interface RawDocumentRef {
  label: string;
  href: string;
}

export interface RawAuctionRecord {
  title: string;
  fields: Record<string, string[]>; // label -> one or more raw text values
  documents: RawDocumentRef[];
}

/**
 * Level-1 extraction (per spec §19): bankauctions.in detail pages render a
 * plain label/value table (`table.v3_notice`) with no JS required, so a
 * normal HTML parser is sufficient — no AI call needed for this source.
 */
export function extractBankAuctionsListing(html: string): RawAuctionRecord | null {
  const $ = cheerio.load(html);

  const title = $(".entry-title").first().text().trim();
  const table = $("table.v3_notice");
  if (!title || table.length === 0) return null;

  const fields: Record<string, string[]> = {};
  const documents: RawDocumentRef[] = [];

  table.find("tbody > tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().replace(/:\s*$/, "").trim();
    const valueCell = $(cells[1]);

    const link = valueCell.find("a[href]").first();
    if (link.length > 0 && /download|view|notice|form/i.test(label)) {
      documents.push({ label, href: link.attr("href")!.trim() });
      return;
    }

    const value = valueCell.text().replace(/\s+/g, " ").trim();
    if (!value) return;
    (fields[label] ??= []).push(value);
  });

  return { title, fields, documents };
}

export function firstField(record: RawAuctionRecord, label: string): string | null {
  const v = record.fields[label];
  return v && v.length > 0 ? v[0] : null;
}
