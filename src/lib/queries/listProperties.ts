import { prisma } from "@/lib/db/prisma";
import { AuctionStatus, Prisma, PropertyCategory } from "@prisma/client";
import { canonCity } from "@/lib/pipeline/locations";

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

const ACTIVE_STATUSES: AuctionStatus[] = ["UPCOMING", "LIVE", "AUCTION_TODAY"];

function textMatch(term: string): Prisma.PropertyWhereInput {
  return {
    OR: [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { addressText: { contains: term, mode: "insensitive" } },
    ],
  };
}

/** The where-clause shared by the website lists, the counts and the public API. */
export function publishedWhere(filters: PropertyFilters = {}): Prisma.PropertyWhereInput {
  const priceFilter =
    filters.priceMin !== undefined || filters.priceMax !== undefined
      ? { gte: filters.priceMin, lte: filters.priceMax }
      : undefined;

  const statusFilter =
    filters.statusGroup === "active"
      ? { in: ACTIVE_STATUSES }
      : filters.statusGroup === "completed"
        ? { notIn: ACTIVE_STATUSES }
        : undefined;

  const and: Prisma.PropertyWhereInput[] = [];
  if (filters.keyword) and.push(textMatch(filters.keyword));
  // AI-verified place first (exact); listings the AI has not checked yet fall back to a text match.
  if (filters.state) {
    const state = filters.state;
    and.push({ OR: [{ geoState: { equals: state, mode: "insensitive" } }, { AND: [{ geoCheckedAt: null }, textMatch(state)] }] });
  }
  if (filters.city) {
    const city = canonCity(filters.city);
    and.push({ OR: [{ geoCity: { equals: city, mode: "insensitive" } }, { AND: [{ geoCheckedAt: null }, textMatch(filters.city)] }] });
  }
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
        status: statusFilter,
      },
    },
    AND: and.length ? and : undefined,
  };
}

export function countPublishedProperties(filters: PropertyFilters = {}) {
  return prisma.property.count({ where: publishedWhere(filters) });
}

export async function listPublishedProperties(filters: PropertyFilters = {}, take = 24, skip = 0) {
  return prisma.property.findMany({
    where: publishedWhere(filters),
    orderBy: { createdAt: "desc" },
    take,
    skip,
    include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 }, media: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } },
  });
}

export function toPropertyCardData(p: Awaited<ReturnType<typeof listPublishedProperties>>[number]) {
  const auction = p.auctions[0];
  return {
    slug: p.slug,
    title: p.title,
    addressText: p.addressText,
    category: p.category,
    bankName: auction?.bank?.name ?? null,
    reservePrice: auction?.reservePrice ?? null,
    auctionStart: auction?.auctionStart ?? null,
    status: auction?.status ?? null,
    imageUrl: p.media[0]?.media.sourceUrl ?? null,
  };
}
