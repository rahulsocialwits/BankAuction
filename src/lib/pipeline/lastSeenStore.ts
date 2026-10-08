import { prisma } from "@/lib/db/prisma";
import { activeAuctionWhere } from "@/lib/domain/auctionLifecycle";
import { MISSING_PREFIX, SEEN_PREFIX, type LastSeenStore, type MissingState, type SweepCandidate } from "./lastSeen";

/*
 * Prisma store for last-seen tracking. No schema change: two kinds of PropertyChange rows per listing and source,
 *   field "seen:<source>"    one pointer row; detectedAt = when the source last showed the listing
 *   field "missing:<source>" one state row (JSON MissingState): consecutive missed passes and the flag
 * plus history notes ("disappearance_flag" / "disappearance_cleared"). This module never touches a Property or an Auction.
 */

const CHUNK = 500;
const MAX_CANDIDATES = 50_000;

const chunks = <T,>(xs: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

function parseState(raw: string | null | undefined): MissingState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<MissingState>;
    return typeof p.n === "number" ? { n: p.n, flagged: p.flagged === true, pass: typeof p.pass === "string" ? p.pass : null, flaggedAt: typeof p.flaggedAt === "string" ? p.flaggedAt : undefined } : null;
  } catch {
    return null;
  }
}

export const prismaLastSeenStore: LastSeenStore = {
  async touch(source, propertyIds, now) {
    const field = `${SEEN_PREFIX}${source}`;
    for (const part of chunks(propertyIds)) {
      const found: { propertyId: string | null }[] = await prisma.propertyChange.findMany({ where: { propertyId: { in: part }, field }, select: { propertyId: true } });
      const have = new Set(found.map((r) => r.propertyId as string));
      if (have.size) await prisma.propertyChange.updateMany({ where: { propertyId: { in: [...have] }, field }, data: { detectedAt: now } });
      const fresh = part.filter((id) => !have.has(id));
      if (fresh.length) await prisma.propertyChange.createMany({ data: fresh.map((propertyId) => ({ propertyId, field, oldValue: null, newValue: "seen", detectedAt: now })) });
    }
  },

  async flaggedAmong(source, propertyIds) {
    const out: string[] = [];
    for (const part of chunks(propertyIds)) {
      const rows: { propertyId: string | null }[] = await prisma.propertyChange.findMany({ where: { propertyId: { in: part }, field: `${MISSING_PREFIX}${source}`, newValue: { contains: '"flagged":true' } }, select: { propertyId: true } });
      for (const r of rows) if (r.propertyId) out.push(r.propertyId);
    }
    return out;
  },

  async candidates(source): Promise<SweepCandidate[]> {
    const out: SweepCandidate[] = [];
    let cursor: string | undefined;
    while (out.length < MAX_CANDIDATES) {
      const rows: { id: string; propertyId: string | null; detectedAt: Date }[] = await prisma.propertyChange.findMany({
        where: { field: `${SEEN_PREFIX}${source}`, property: { status: "PUBLISHED", auctions: { some: activeAuctionWhere() } } },
        orderBy: { id: "asc" },
        take: 2000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, propertyId: true, detectedAt: true },
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      const ids = rows.map((r) => r.propertyId).filter((x): x is string => !!x);
      const states = new Map<string, MissingState | null>();
      for (const part of chunks(ids)) {
        const stateRows: { propertyId: string | null; newValue: string | null }[] = await prisma.propertyChange.findMany({ where: { propertyId: { in: part }, field: `${MISSING_PREFIX}${source}` }, select: { propertyId: true, newValue: true } });
        for (const s of stateRows) {
          if (s.propertyId) states.set(s.propertyId, parseState(s.newValue));
        }
      }
      for (const r of rows) if (r.propertyId) out.push({ propertyId: r.propertyId, lastSeenAt: r.detectedAt, missing: states.get(r.propertyId) ?? null });
      if (rows.length < 2000) break;
    }
    return out;
  },

  async saveState(source, propertyId, state) {
    const field = `${MISSING_PREFIX}${source}`;
    const newValue = JSON.stringify(state);
    const have = await prisma.propertyChange.findFirst({ where: { propertyId, field }, select: { id: true } });
    if (have) await prisma.propertyChange.update({ where: { id: have.id }, data: { newValue } });
    else await prisma.propertyChange.create({ data: { propertyId, field, oldValue: null, newValue } });
  },

  async audit(propertyId, field, note) {
    await prisma.propertyChange.create({ data: { propertyId, field, oldValue: null, newValue: note.slice(0, 480) } });
  },
};
