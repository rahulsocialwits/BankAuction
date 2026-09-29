import { prisma } from "@/lib/db/prisma";
import { AuctionStatus } from "@prisma/client";

export async function listAuctionsByStatus(statuses: AuctionStatus[], take = 48) {
  return prisma.auction.findMany({
    where: { status: { in: statuses }, property: { status: "PUBLISHED" } },
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
    status: a.status,
  };
}
