import { prisma } from "@/lib/db/prisma";
import type { AuctionStatus, PropertyCategory } from "@prisma/client";
import { effectiveAuctionStatus } from "@/lib/domain/auctionLifecycle";
import { publishedWhere, type PropertyFilters } from "@/lib/queries/publishedWhere";

// The shared where-clause (verified city, effective auction status via activeAuctionWhere() / inactiveAuctionWhere()) lives in
// publishedWhere.ts so it can be tested without a database; everything that imported it from here keeps working.
export { publishedWhere };
export type { PropertyFilters, StatusGroup } from "@/lib/queries/publishedWhere";

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

export function toPropertyCardData(p: {
  slug: string;
  title: string;
  addressText: string | null;
  category: PropertyCategory | null;
  auctions: Array<{
    bank: { name: string } | null;
    reservePrice: unknown;
    auctionStart: Date | null;
    auctionEnd?: Date | null;
    status: AuctionStatus;
  }>;
  media?: Array<{ media: { sourceUrl: string } }>;
}) {
  const auction = p.auctions[0];
  return {
    slug: p.slug,
    title: p.title,
    addressText: p.addressText,
    category: p.category,
    bankName: auction?.bank?.name ?? null,
    reservePrice: auction?.reservePrice ?? null,
    auctionStart: auction?.auctionStart ?? null,
    status: auction ? effectiveAuctionStatus(auction) : null,
    imageUrl: p.media?.[0]?.media.sourceUrl ?? null,
  };
}
