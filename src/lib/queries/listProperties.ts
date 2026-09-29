import { prisma } from "@/lib/db/prisma";
import { PropertyCategory } from "@prisma/client";

export interface PropertyFilters {
  category?: PropertyCategory;
  bankId?: string;
  addressText?: string;
  keyword?: string;
}

export async function listPublishedProperties(filters: PropertyFilters = {}, take = 24) {
  return prisma.property.findMany({
    where: {
      status: "PUBLISHED",
      category: filters.category,
      addressText: filters.addressText,
      auctions: filters.bankId ? { some: { bankId: filters.bankId } } : undefined,
      OR: filters.keyword
        ? [
            { title: { contains: filters.keyword, mode: "insensitive" } },
            { description: { contains: filters.keyword, mode: "insensitive" } },
            { addressText: { contains: filters.keyword, mode: "insensitive" } },
          ]
        : undefined,
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
