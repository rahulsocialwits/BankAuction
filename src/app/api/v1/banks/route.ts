import { NextRequest } from "next/server";
import { apiJson, authenticateApi } from "@/lib/apiKeys";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/v1/banks: every bank with at least one published listing. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return auth.response;

  const banks = await prisma.bank.findMany({
    orderBy: { name: "asc" },
    select: { name: true, slug: true, _count: { select: { auctions: { where: { property: { status: "PUBLISHED" } } } } } },
  });
  return apiJson({ data: banks.filter((b) => b._count.auctions > 0).map((b) => ({ name: b.name, slug: b.slug, listings: b._count.auctions })) });
}
