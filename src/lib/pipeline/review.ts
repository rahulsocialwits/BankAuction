import { prisma } from "@/lib/db/prisma";
import type { PropertyCategory } from "@prisma/client";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { getAiConfig } from "@/lib/ai/aiConfig";
import { classifyPropertyType } from "@/lib/normalization/classifyPropertyType";
import { isVehicleListing } from "@/lib/import/csvImport";

/**
 * Reviews listings that landed in "Pending review" so nobody has to. Order of work, cheapest first:
 *  1. Code rules. Vehicles / movable assets are removed. A listing with a recognisable property type, a place
 *     and a price or date is published (and its category is filled in).
 *  2. Only what the rules cannot settle goes to the Relay AI, which answers publish / remove with a confidence.
 *     It acts only when confident (>= 0.7); anything else stays pending and shows under "Needs attention".
 * Every decision is written to the property's change log ("auto_review") with the reason.
 */

const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL"];

const SYSTEM = `You review bank-auction property listings for a public website that lists REAL ESTATE ONLY (flats, houses, land, plots, shops, offices, factories, farms). For each numbered listing decide:
- "publish": it is a genuine real-estate auction listing with enough information for a buyer (a clear property, a place, and a price or an auction date).
- "remove": it is NOT real estate (vehicles, machinery, stock, jewellery, shares), is gibberish/test data, or has almost no usable information.
Also give "category" (one of RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL, or null) and "confidence" from 0 to 1, and a short "reason" (under 12 words). Never guess: lower the confidence when unsure.
Return ONLY a JSON array like [{"i":1,"decision":"publish","category":"RESIDENTIAL","confidence":0.9,"reason":"flat with city and price"}].`;

interface Decision {
  i: number;
  decision: "publish" | "remove";
  category: string | null;
  confidence: number;
  reason: string;
}

export interface ReviewResult {
  published: number;
  removed: number;
  stillPending: number;
  tokens: number;
}

export async function autoReviewPending(limit = 60): Promise<ReviewResult> {
  const pending = await prisma.property.findMany({
    where: { status: "PENDING_REVIEW" },
    select: {
      id: true,
      title: true,
      description: true,
      addressText: true,
      geoCity: true,
      category: true,
      attributes: { where: { key: "source_property_type" }, select: { value: true } },
      auctions: { select: { reservePrice: true, auctionStart: true, bank: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const out: ReviewResult = { published: 0, removed: 0, stillPending: 0, tokens: 0 };
  const note = (propertyId: string, newValue: string) => prisma.propertyChange.create({ data: { propertyId, field: "auto_review", oldValue: "PENDING_REVIEW", newValue } });

  const ambiguous: typeof pending = [];
  for (const p of pending) {
    const a = p.auctions[0];
    const rawType = p.attributes[0]?.value ?? "";
    const category: PropertyCategory | null = p.category ?? classifyPropertyType(rawType) ?? classifyPropertyType(p.title);

    if (isVehicleListing(p.title, category) || category === "VEHICLE") {
      await prisma.property.update({ where: { id: p.id }, data: { status: "REMOVED" } });
      await note(p.id, "Removed: not real estate (vehicle / movable asset)");
      out.removed++;
      continue;
    }

    const hasPlace = !!(p.geoCity || p.addressText);
    const hasMoneyOrDate = !!(a?.reservePrice || a?.auctionStart);
    if (category && hasPlace && hasMoneyOrDate && p.title.length >= 8) {
      await prisma.property.update({ where: { id: p.id }, data: { status: "PUBLISHED", category } });
      await note(p.id, `Published by rules: ${category.toLowerCase().replace("_", " ")} with place and ${a?.reservePrice ? "price" : "date"}`);
      out.published++;
      continue;
    }
    ambiguous.push(p);
  }

  if (ambiguous.length === 0) return out;
  const cfg = await getAiConfig();
  if (!cfg.enabled || !cfg.keyValid) {
    out.stillPending = ambiguous.length;
    return out;
  }

  const BATCH = 10;
  for (let s = 0; s < ambiguous.length; s += BATCH) {
    const batch = ambiguous.slice(s, s + BATCH);
    const lines = batch
      .map((p, k) => {
        const a = p.auctions[0];
        return `${k + 1}. ${p.title} | place: ${p.geoCity ?? p.addressText ?? "-"} | bank: ${a?.bank?.name ?? "-"} | price: ${a?.reservePrice?.toString() ?? "-"} | date: ${a?.auctionStart?.toISOString().slice(0, 10) ?? "-"} | ${(p.description ?? "").replace(/\s+/g, " ").slice(0, 140)}`;
      })
      .join("\n");
    let decisions: Decision[] = [];
    try {
      const r = await chatJSONDetailed<Decision[]>(SYSTEM + (cfg.rules ? `\nOwner's standing rules (follow them):\n${cfg.rules}` : ""), lines);
      out.tokens += r.tokens;
      decisions = Array.isArray(r.data) ? r.data : [];
    } catch {
      out.stillPending += batch.length;
      continue;
    }
    const done = new Set<string>();
    for (const d of decisions) {
      const p = batch[Number(d?.i) - 1];
      if (!p || !(Number(d.confidence) >= 0.7)) continue;
      const reason = String(d.reason ?? "").slice(0, 100);
      if (d.decision === "publish") {
        const cat = CATEGORIES.includes(String(d.category)) ? (d.category as PropertyCategory) : (p.category ?? undefined);
        await prisma.property.update({ where: { id: p.id }, data: { status: "PUBLISHED", ...(cat && { category: cat }) } });
        await note(p.id, `Published by AI (confidence ${Number(d.confidence).toFixed(2)}): ${reason}`);
        out.published++;
        done.add(p.id);
      } else if (d.decision === "remove") {
        await prisma.property.update({ where: { id: p.id }, data: { status: "REMOVED" } });
        await note(p.id, `Removed by AI (confidence ${Number(d.confidence).toFixed(2)}): ${reason}`);
        out.removed++;
        done.add(p.id);
      }
    }
    out.stillPending += batch.filter((p) => !done.has(p.id)).length;
  }
  return out;
}
