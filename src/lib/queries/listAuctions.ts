import { prisma } from "@/lib/db/prisma";
import { AuctionStatus } from "@prisma/client";
import { auctionStatusWhere, effectiveAuctionStatus } from "@/lib/domain/auctionLifecycle";

export async function listAuctionsByStatus(statuses: AuctionStatus[], take = 48) {
  return prisma.auction.findMany({
    // effective status: an open auction whose date is over is listed as completed (see auctionLifecycle.ts); nothing is written
    where: { AND: [auctionStatusWhere(statuses)], property: { status: "PUBLISHED" } },
    orderBy: { auctionStart: "asc" },
    take,
    include: { bank: true, property: true },
  });
}

export function auctionToCardData(a: Awaited<ReturnType<typeof listAuctionsByStatus>>[number]) {
  return {
    slug: a.property.slug,
    title: a.property.title,
    addressText: a.property.addressText,
    category: a.property.category,
    bankName: a.bank?.name ?? null,
    reservePrice: a.reservePrice,
    auctionStart: a.auctionStart,
    status: effectiveAuctionStatus(a),
    imageUrl: null,
  };
}
