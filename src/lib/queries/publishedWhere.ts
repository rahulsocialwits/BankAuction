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
 * Free-text search: every word must be found, each in the title, description, address, city, state or locality
 * ("flat andheri mumbai 400058" finds a flat whose address has andheri and 400058 in a Mumbai listing).
 */
export function keywordClauses(keyword: string): Prisma.PropertyWhereInput[] {
  const terms = keyword.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  return terms.map((term) => ({
    OR: [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { addressText: { contains: term, mode: "insensitive" } },
      { geoCity: { contains: term, mode: "insensitive" } },
      { geoState: { contains: term, mode: "insensitive" } },
      { geoLocality: { contains: term, mode: "insensitive" } },
    ],
  }));
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
