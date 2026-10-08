import { prisma } from "@/lib/db/prisma";
import { decideSameProperty, exactTitleMergeAllowed, formatMergeNote, titleTokens, type IdentityFacts, type MatchDecision, type MatchRule } from "./propertyIdentity";
import { recordMerge } from "./mergeLog";

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
 * Automatic clean-up run after every scheduled tick. Hides (never deletes) the later copy of a listing that is provably the same
 * property. Hiding needs evidence beyond a look-alike title and price (see propertyIdentity.ts): the same address, or an exact and
 * SPECIFIC title with no contradicting address. Every hide is written to the property's history (PropertyChange "dedup_merge",
 * with the status it had, the keeper and the rule), so it can be traced and restored from Admin → Engine → Duplicates.
 * Returns how many listings were hidden.
 */
export async function autoCleanExactDuplicates(): Promise<number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const props = await prisma.property.findMany({
    where: { status: { in: ["PUBLISHED", "PENDING_REVIEW", "DRAFT"] } },
    select: {
      id: true,
      title: true,
      status: true,
      addressText: true,
      createdAt: true,
      auctions: { select: { bankId: true, reservePrice: true, auctionStart: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });
  type P = (typeof props)[number];
  const factsOf = (p: P): IdentityFacts => ({ tokens: titleTokens(p.title), reserve: p.auctions[0]?.reservePrice ? Number(p.auctions[0].reservePrice) : null, start: p.auctions[0]?.auctionStart ?? null, address: p.addressText });
  // keep the listing with the latest auction date (the live one); on a tie keep the oldest record
  const byLive = (x: P, y: P) => (y.auctions[0].auctionStart?.getTime() ?? 0) - (x.auctions[0].auctionStart?.getTime() ?? 0) || x.createdAt.getTime() - y.createdAt.getTime();

  const hide: { p: P; keeper: P; rule: MatchRule | "exact_title"; detail: string }[] = [];
  const hidden = new Set<string>();

  // Pass 1: same bank + the same title (ignoring case and punctuation) + the same reserve price. The auction date may differ: that is
  // the same property put up again. Not enough on its own when the title is generic ("Shops", "Individual House": different units)
  // or when the two addresses contradict each other.
  const groups = new Map<string, P[]>();
  for (const p of props) {
    const a = p.auctions[0];
    if (!a?.bankId || !a.reservePrice) continue;
    const key = `${norm(p.title)}|${a.bankId}|${a.reservePrice.toString()}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keeper = [...list].sort(byLive)[0];
    for (const p of list) {
      if (p.id === keeper.id || !exactTitleMergeAllowed(factsOf(p), factsOf(keeper))) continue;
      hide.push({ p, keeper, rule: "exact_title", detail: "same bank, same title, same reserve price, addresses do not contradict" });
      hidden.add(p.id);
    }
  }

  // Pass 2: same bank and the very same reserve price, worded differently: only when the shared decision proves it is one property
  // (same address, or a distinctive identical title). A similar title and price alone no longer qualifies.
  const byPrice = new Map<string, P[]>();
  for (const p of props) {
    const a = p.auctions[0];
    if (hidden.has(p.id) || !a?.bankId || !a.reservePrice) continue;
    const key = `${a.bankId}|${a.reservePrice.toString()}`;
    byPrice.set(key, [...(byPrice.get(key) ?? []), p]);
  }
  for (const list of byPrice.values()) {
    if (list.length < 2) continue;
    const kept: P[] = [];
    for (const p of [...list].sort(byLive)) {
      let found: { keeper: P; d: MatchDecision } | null = null;
      for (const k of kept) {
        const d = decideSameProperty(factsOf(p), factsOf(k));
        if (d.match) { found = { keeper: k, d }; break; }
      }
      if (found) {
        hide.push({ p, keeper: found.keeper, rule: found.d.rule ?? "same_address", detail: found.d.reason });
        hidden.add(p.id);
      } else kept.push(p);
    }
  }

  if (hide.length) {
    await prisma.property.updateMany({ where: { id: { in: hide.map((h) => h.p.id) } }, data: { status: "DUPLICATE" } });
    for (const h of hide) await recordMerge(h.p.id, h.p.status, formatMergeNote(h.rule, "scheduler clean-up", `hidden as a duplicate of ${h.keeper.id}: ${h.detail}`));
  }
  return hide.length;
}
