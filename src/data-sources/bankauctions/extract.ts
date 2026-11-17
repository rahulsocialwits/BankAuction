import * as cheerio from "cheerio";

export interface RawDocumentRef {
  label: string;
  href: string;
}

export interface RawAuctionRecord {
  title: string;
  fields: Record<string, string[]>; // label -> one or more raw text values
  documents: RawDocumentRef[];
  imageUrls: string[];
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

  // Extract property images: WordPress featured image and any inline content images.
  // Only keep absolute URLs on the same host (bankauctions.in); skip tiny tracking pixels.
  const BASE_HOST = "bankauctions.in";
  const imageUrls: string[] = [];
  const seen = new Set<string>();

  const addImage = (src: string | undefined) => {
    if (!src) return;
    const url = src.trim().split(/[\s?#]/)[0]; // strip srcset extras and query strings
    if (!url || seen.has(url)) return;
    // Allow relative paths or same-host absolute URLs; block external images
    const absolute = url.startsWith("http")
      ? url
      : url.startsWith("//")
        ? "https:" + url
        : null;
    if (absolute && !absolute.includes(BASE_HOST)) return;
    seen.add(url);
    imageUrls.push(absolute ?? url);
  };

  // WordPress featured image (class "wp-post-image" or inside ".post-thumbnail")
  $(".wp-post-image, .post-thumbnail img").each((_, el) => {
    addImage($(el).attr("src"));
  });

  // Images inside the entry/article body content
  $(".entry-content img, .post-content img, article img").each((_, el) => {
    const src = $(el).attr("src");
    const w = parseInt($(el).attr("width") ?? "9999", 10);
    const h = parseInt($(el).attr("height") ?? "9999", 10);
    // Skip images that are explicitly declared tiny (tracking pixels / icons)
    if (w < 50 || h < 50) return;
    addImage(src);
  });

  return { title, fields, documents, imageUrls };
}

export function firstField(record: RawAuctionRecord, label: string): string | null {
  const v = record.fields[label];
  return v && v.length > 0 ? v[0] : null;
}
