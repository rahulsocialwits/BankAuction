import { NextRequest } from "next/server";
import type { PropertyCategory } from "@prisma/client";
import { apiError, apiJson, authenticateApi } from "@/lib/apiKeys";
import { apiPropertyInclude, toApiProperty } from "@/lib/apiShape";
import { countPublishedProperties, publishedWhere, type StatusGroup } from "@/lib/queries/listProperties";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL"];

/**
 * GET /api/v1/properties
 * Filters: state, city, locality, category, bank (slug), q, status (active|completed|all, default active),
 * priceMin, priceMax, updatedSince (ISO date). Paging: page (from 1), limit (1–50, default 20).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 20));

  const category = sp.get("category")?.toUpperCase();
  if (category && !CATEGORIES.includes(category)) return apiError(400, "bad_category", `category must be one of ${CATEGORIES.join(", ")}.`);
  const statusRaw = sp.get("status") ?? "active";
  if (!["active", "completed", "all"].includes(statusRaw)) return apiError(400, "bad_status", "status must be active, completed or all.");
  const since = sp.get("updatedSince") ? new Date(sp.get("updatedSince")!) : null;
  if (since && Number.isNaN(since.getTime())) return apiError(400, "bad_date", "updatedSince must be an ISO date such as 2026-10-01.");

  const bankSlug = sp.get("bank");
  const bank = bankSlug ? await prisma.bank.findUnique({ where: { slug: bankSlug }, select: { id: true } }) : null;
  if (bankSlug && !bank) return apiJson({ data: [], page, limit, total: 0, hasMore: false });

  const filters = {
    state: sp.get("state") || undefined,
    city: sp.get("city") || undefined,
    locality: sp.get("locality") || undefined,
    keyword: sp.get("q") || undefined,
    category: (category as PropertyCategory | undefined) || undefined,
    bankId: bank?.id,
    statusGroup: statusRaw as StatusGroup,
    priceMin: sp.get("priceMin") ? Number(sp.get("priceMin")) : undefined,
    priceMax: sp.get("priceMax") ? Number(sp.get("priceMax")) : undefined,
  };
  const where = { ...publishedWhere(filters), ...(since && { updatedAt: { gte: since } }) };

  const [rows, total] = await Promise.all([
    prisma.property.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: (page - 1) * limit, include: apiPropertyInclude }),
    since ? prisma.property.count({ where }) : countPublishedProperties(filters),
  ]);

  return apiJson({ data: rows.map((p) => toApiProperty(p)), page, limit, total, hasMore: page * limit < total });
}
