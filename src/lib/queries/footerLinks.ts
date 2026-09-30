import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/** Banks with the most published listings, for the footer. Cached so the footer never hits the DB per request. */
const cachedTopBanks = unstable_cache(
  async () => {
    const groups = await prisma.auction.groupBy({
      by: ["bankId"],
      where: { bankId: { not: null }, property: { status: "PUBLISHED" } },
      _count: { _all: true },
      orderBy: { _count: { bankId: "desc" } },
      take: 6,
    });
    const banks = await prisma.bank.findMany({
      where: { id: { in: groups.map((g) => g.bankId!).filter(Boolean) } },
      select: { id: true, name: true },
    });
    return groups
      .map((g) => banks.find((b) => b.id === g.bankId))
      .filter((b): b is { id: string; name: string } => !!b);
  },
  ["footer-top-banks"],
  { revalidate: 600 },
);

type FooterBank = { id: string; name: string };

/** Failures (e.g. pool timeout while many pages build at once) fall back to an empty list and are not cached. */
export async function getTopBanks(): Promise<FooterBank[]> {
  try {
    return await cachedTopBanks();
  } catch {
    return [];
  }
}
