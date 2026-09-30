import { prisma } from "@/lib/db/prisma";
import { AuctionStatus, Prisma, PropertyCategory } from "@prisma/client";

export type StatusGroup = "active" | "completed" | "all";

export interface PropertyFilters {
  category?: PropertyCategory;
  bankId?: string;
  addressText?: string;
  keyword?: string;
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

export async function listPublishedProperties(filters: PropertyFilters = {}, take = 24) {
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
  if (filters.city) and.push(textMatch(filters.city));
  if (filters.locality) and.push(textMatch(filters.locality));

  return prisma.property.findMany({
    where: {
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
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 } },
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
  };
}
