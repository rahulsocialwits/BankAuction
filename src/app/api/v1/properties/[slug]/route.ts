import { NextRequest } from "next/server";
import { apiError, apiJson, authenticateApi } from "@/lib/apiKeys";
import { apiPropertyInclude, toApiProperty } from "@/lib/apiShape";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/v1/properties/{slug}: one listing with its description, legal schedule and extra details. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  const p = await prisma.property.findUnique({ where: { slug }, include: apiPropertyInclude });
  if (!p || p.status !== "PUBLISHED") return apiError(404, "not_found", "No published property with that slug.");
  return apiJson({ data: toApiProperty(p, true) });
}
