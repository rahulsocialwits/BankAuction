import { prisma } from "@/lib/db/prisma";

export interface DupMember {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: Date;
  source: string;
}

export interface DupGroup {
  key: string;
  reason: string;
  /** Average pairwise title similarity (0–1). High = almost certainly the same property. */
  similarity: number;
  members: DupMember[]; // oldest first: the first one is kept
}

const STOP = new Set(["at", "in", "of", "the", "and", "a", "to", "near", "road", "village", "taluk", "district"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Same bank + same reserve price + same auction day, with how alike their titles are. */
export async function findDuplicateGroups(): Promise<DupGroup[]> {
  const props = await prisma.property.findMany({
    where: { status: { in: ["PUBLISHED", "PENDING_REVIEW", "DRAFT"] } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      createdAt: true,
      auctions: { select: { bankId: true, reservePrice: true, auctionStart: true }, orderBy: { createdAt: "desc" }, take: 1 },
      sourceRecords: { select: { source: { select: { name: true } } }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
    take: 10_000,
  });

  const buckets = new Map<string, typeof props>();
  for (const p of props) {
    const a = p.auctions[0];
    if (!a?.bankId || !a.reservePrice || !a.auctionStart) continue;
    const key = `${a.bankId}|${a.reservePrice.toString()}|${a.auctionStart.toISOString().slice(0, 10)}`;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }

  const groups: DupGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const toks = list.map((p) => tokens(p.title));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { sum += jaccard(toks[i], toks[j]); n++; }
    groups.push({
      key,
      reason: "Same bank, reserve price and auction day",
      similarity: n ? sum / n : 0,
      members: list.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt,
        source: p.sourceRecords[0]?.source.name ?? "Manual / import",
      })),
    });
  }
  return groups.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Automatic rule run after every scheduled tick: same bank + same reserve price + same auction day
 * AND identical title => the later copies are hidden as DUPLICATE (oldest kept). Reversible from
 * Admin → Properties → Duplicates → Restore. Returns how many listings were hidden.
 */
export async function autoCleanExactDuplicates(): Promise<number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const props = await prisma.property.findMany({
    where: { status: { in: ["PUBLISHED", "PENDING_REVIEW", "DRAFT"] } },
    select: {
      id: true,
      title: true,
      createdAt: true,
      auctions: { select: { bankId: true, reservePrice: true, auctionStart: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });

  // 100% match = same bank + the same title (ignoring case and punctuation) + the same reserve price.
  // The auction date may differ: that is the same property put up for auction again, and one listing is enough.
  // (Same title but a different price is a different flat in the same building, so it is kept.)
  const groups = new Map<string, typeof props>();
  for (const p of props) {
    const a = p.auctions[0];
    if (!a?.bankId || !a.reservePrice) continue;
    const key = `${norm(p.title)}|${a.bankId}|${a.reservePrice.toString()}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const hide: string[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // keep the listing with the latest auction date (the live one); on a tie keep the oldest record
    const keep = [...list].sort((x, y) => (y.auctions[0].auctionStart?.getTime() ?? 0) - (x.auctions[0].auctionStart?.getTime() ?? 0) || x.createdAt.getTime() - y.createdAt.getTime())[0];
    for (const p of list) if (p.id !== keep.id) hide.push(p.id);
  }
  // Second pass: same bank and the very same reserve price, with clearly overlapping titles (a source that words the
  // same listing differently from run to run). Greedy: the keeper is chosen first, later look-alikes are hidden.
  const hidden = new Set(hide);
  const byPrice = new Map<string, typeof props>();
  for (const p of props) {
    const a = p.auctions[0];
    if (hidden.has(p.id) || !a?.bankId || !a.reservePrice) continue;
    const key = `${a.bankId}|${a.reservePrice.toString()}`;
    byPrice.set(key, [...(byPrice.get(key) ?? []), p]);
  }
  for (const list of byPrice.values()) {
    if (list.length < 2) continue;
    const ordered = [...list].sort((x, y) => (y.auctions[0].auctionStart?.getTime() ?? 0) - (x.auctions[0].auctionStart?.getTime() ?? 0) || x.createdAt.getTime() - y.createdAt.getTime());
    const kept: { id: string; tokens: Set<string> }[] = [];
    for (const p of ordered) {
      const t = tokens(p.title);
      if (kept.some((k) => jaccard(t, k.tokens) >= 0.4)) {
        hide.push(p.id);
        hidden.add(p.id);
      } else kept.push({ id: p.id, tokens: t });
    }
  }
  if (hide.length) await prisma.property.updateMany({ where: { id: { in: hide } }, data: { status: "DUPLICATE" } });
  return hide.length;
}
