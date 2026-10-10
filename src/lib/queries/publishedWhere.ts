import type { Prisma, PropertyCategory } from "@prisma/client";
import { canonCity } from "@/lib/pipeline/locations";
import { activeAuctionWhere, inactiveAuctionWhere } from "@/lib/domain/auctionLifecycle";

/*
 * The shared where-clause for visitor-facing property lists, counts and the public API. It lives apart from listProperties.ts (which
 * opens the database client) so tests can load the real clause without a database. listProperties.ts re-exports everything here.
 */

export type StatusGroup = "active" | "completed" | "all";

export interface PropertyFilters {
  category?: PropertyCategory;
  bankId?: string;
  addressText?: string;
  keyword?: string;
  state?: string;
  city?: string;
  locality?: string;
  statusGroup?: StatusGroup;
  priceMin?: number;
  priceMax?: number;
}

function textMatch(term: string): Prisma.PropertyWhereInput {
  return {
    OR: [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { addressText: { contains: term, mode: "insensitive" } },
    ],
  };
}

/**
 * Spelling variants of one search word, so "nalasopara" finds "Nallasopara": the word with its doubled letters collapsed, and the
 * word with one common consonant doubled. Only for plain words of 4+ letters; anything else (a PIN, a number) is matched as typed.
 */
export function spellingVariants(term: string): string[] {
  const t = term.toLowerCase();
  if (!/^[a-z]{4,}$/.test(t)) return [];
  const out = new Set<string>();
  const collapsed = t.replace(/(.)\1+/g, "$1");
  if (collapsed !== t) out.add(collapsed);
  for (let i = 0; i < t.length; i++) {
    if (/[lnmtdrspkbgc]/.test(t[i]) && t[i + 1] !== t[i] && t[i - 1] !== t[i]) out.add(t.slice(0, i + 1) + t[i] + t.slice(i + 1));
  }
  out.delete(t);
  return [...out].slice(0, 14);
}

const termFields = (term: string, withDescription: boolean): Prisma.PropertyWhereInput[] => [
  { title: { contains: term, mode: "insensitive" } },
  ...(withDescription ? [{ description: { contains: term, mode: "insensitive" as const } }] : []),
  { addressText: { contains: term, mode: "insensitive" } },
  { geoCity: { contains: term, mode: "insensitive" } },
  { geoState: { contains: term, mode: "insensitive" } },
  { geoLocality: { contains: term, mode: "insensitive" } },
];

/**
 * Free-text search: every word must be found, each in the title, description, address, city, state or locality
 * ("flat andheri mumbai 400058" finds a flat whose address has andheri and 400058 in a Mumbai listing). A word also matches its
 * common spelling variants (doubled letters), and the words typed with spaces also match when joined ("nala sopara").
 */
export function keywordClauses(keyword: string): Prisma.PropertyWhereInput[] {
  const terms = keyword.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  const perWord: Prisma.PropertyWhereInput[] = terms.map((term) => ({
    OR: [...termFields(term, true), ...spellingVariants(term).flatMap((v) => termFields(v, false))],
  }));
  const joined = terms.join("");
  if (terms.length >= 2 && /^[a-z]{5,}$/i.test(joined) && terms.every((t) => /^[a-z]+$/i.test(t))) {
    return [{ OR: [{ AND: perWord }, ...[joined.toLowerCase(), ...spellingVariants(joined)].flatMap((v) => termFields(v, false))] }];
  }
  return perWord;
}

/** The where-clause shared by the website lists, the counts and the public API. */
export function publishedWhere(filters: PropertyFilters = {}): Prisma.PropertyWhereInput {
  const priceFilter =
    filters.priceMin !== undefined || filters.priceMax !== undefined
      ? { gte: filters.priceMin, lte: filters.priceMax }
      : undefined;

  // Effective status (auctionLifecycle.ts): an auction that is still stored as open but whose date is over counts as ended.
  const statusFilter =
    filters.statusGroup === "active" ? activeAuctionWhere() : filters.statusGroup === "completed" ? inactiveAuctionWhere() : undefined;

  const and: Prisma.PropertyWhereInput[] = [];
  if (filters.keyword) and.push(...keywordClauses(filters.keyword));
  // State and locality: AI-verified place first (exact); listings the AI has not checked yet fall back to a text match.
  if (filters.state) {
    const state = filters.state;
    and.push({ OR: [{ geoState: { equals: state, mode: "insensitive" } }, { AND: [{ geoCheckedAt: null }, textMatch(state)] }] });
  }
  // City: the canonical AI-verified geoCity only (domain/cityCounts.ts). No text fallback for unchecked listings: a city name inside a
  // title or address is not a location, and the homepage city cards count exactly this definition.
  if (filters.city) and.push({ geoCity: { equals: canonCity(filters.city), mode: "insensitive" } });
  if (filters.locality) {
    and.push({ OR: [{ geoLocality: { equals: filters.locality, mode: "insensitive" } }, { AND: [{ geoCheckedAt: null }, textMatch(filters.locality)] }] });
  }

  return {
    status: "PUBLISHED",
    category: filters.category,
    addressText: filters.addressText,
    auctions: {
      some: {
        bankId: filters.bankId,
        reservePrice: priceFilter,
        AND: statusFilter ? [statusFilter] : undefined,
      },
    },
    AND: and.length ? and : undefined,
  };
}
