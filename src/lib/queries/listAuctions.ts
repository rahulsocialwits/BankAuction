import { prisma } from "@/lib/db/prisma";
import { AuctionStatus } from "@prisma/client";
import { auctionStatusWhere, effectiveAuctionStatus } from "@/lib/domain/auctionLifecycle";

export const AUCTIONS_PAGE_SIZE = 48;

/** One page of auctions (and the total) for the /auctions lists. */
export async function listAuctionsByStatus(statuses: AuctionStatus[], page = 1, take = AUCTIONS_PAGE_SIZE) {
  // effective status: an open auction whose date is over is listed as completed (see auctionLifecycle.ts); nothing is written
  const where = { AND: [auctionStatusWhere(statuses)], property: { status: "PUBLISHED" as const } };
  const [rows, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      orderBy: [{ auctionStart: "asc" }, { id: "asc" }],
      skip: (Math.max(1, page) - 1) * take,
      take,
      include: { bank: true, property: { include: { media: { orderBy: { sortOrder: "asc" }, take: 1, include: { media: true } } } } },
    }),
    prisma.auction.count({ where }),
  ]);
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / take)) };
}

export function auctionToCardData(a: Awaited<ReturnType<typeof listAuctionsByStatus>>["rows"][number]) {
  return {
    slug: a.property.slug,
    title: a.property.title,
    addressText: a.property.addressText,
    category: a.property.category,
    bankName: a.bank?.name ?? null,
    reservePrice: a.reservePrice,
    auctionStart: a.auctionStart,
    status: effectiveAuctionStatus(a),
    imageUrl: a.property.media?.[0]?.media.sourceUrl ?? null,
  };
}
