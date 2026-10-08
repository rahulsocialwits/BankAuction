import { prisma } from "@/lib/db/prisma";
import {
  OBS_PREFIX,
  decodeObservation,
  observationsFromListing,
  recordObservations,
  sourceLabelOf,
  type ExtractionMethod,
  type ObservationStore,
  type StoredObservation,
} from "./fieldProvenance";

/*
 * Writes field observations (see fieldProvenance.ts). Append-only: this module only reads PropertyChange rows and creates new
 * ones. It never touches a Property or an Auction, and it never throws: provenance must not break an import.
 */

const MAX_READ = 200;

export const prismaObservationStore: ObservationStore = {
  async latest(propertyId) {
    const rows = await prisma.propertyChange.findMany({
      where: { propertyId, field: { startsWith: OBS_PREFIX } },
      orderBy: { detectedAt: "desc" },
      take: MAX_READ,
      select: { field: true, newValue: true, auctionId: true, detectedAt: true },
    });
    const out: StoredObservation[] = [];
    for (const r of rows) {
      const o = decodeObservation(r);
      if (o) out.push({ ...o, propertyId });
    }
    return out;
  },
  async append(propertyId, rows) {
    if (!rows.length) return;
    await prisma.propertyChange.createMany({ data: rows.map((r) => ({ propertyId, auctionId: r.auctionId, field: r.field, oldValue: null, newValue: r.newValue, detectedAt: r.detectedAt })) });
  },
};

/** Importer / crawler entry point: what this source just showed for one listing. */
export async function observeListing(
  target: { propertyId: string; auctionId: string | null },
  facts: { reserve?: unknown; start?: unknown; address?: unknown },
  ctx: { statusSource: string; method?: ExtractionMethod; document?: string | null },
): Promise<number> {
  return recordObservations(prismaObservationStore, target, observationsFromListing(facts, { source: sourceLabelOf(ctx.statusSource), method: ctx.method ?? "unknown", document: ctx.document ?? null }));
}
