"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyCategory, PropertyStatus } from "@prisma/client";
import { requireMaster } from "@/lib/auth/adminAuth";
import { propertyWhere } from "@/lib/admin/propertyFilter";
import { deriveAuctionStatusFromDates } from "@/lib/domain/deriveAuctionStatus";
import { recordAuctionStatusChange } from "@/lib/pipeline/auctionEvents";

function refresh(slug?: string) {
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");
  if (slug) revalidatePath(`/property/${slug}`);
}

const idOf = (fd: FormData) => {
  const v = fd.get("propertyId");
  return typeof v === "string" && v ? v : null;
};

export async function approveProperty(formData: FormData) {
  const id = idOf(formData);
  if (!id) return;
  const p = await prisma.property.update({ where: { id }, data: { status: "PUBLISHED" } });
  refresh(p.slug);
}

export async function rejectProperty(formData: FormData) {
  const id = idOf(formData);
  if (!id) return;
  const p = await prisma.property.update({ where: { id }, data: { status: "DRAFT" } });
  refresh(p.slug);
}

/**
 * "Delete": hides the listing everywhere but keeps the row, so the crawler that originally found it
 * can never bring it back (a real delete would just be re-imported on the next run).
 */
export async function removeProperty(formData: FormData) {
  const id = idOf(formData);
  if (!id) return;
  const p = await prisma.property.update({ where: { id }, data: { status: "REMOVED" } });
  refresh(p.slug);
}

/** Hides EVERY listing that matches the current filters (master only). Same soft delete as "Delete": nothing is re-imported. */
export async function bulkRemoveProperties(formData: FormData) {
  await requireMaster();
  const g = (k: string) => String(formData.get(k) ?? "") || undefined;
  const where = propertyWhere({ status: g("status"), q: g("q"), source: g("source"), bank: g("bank"), issue: g("issue"), master: true });
  // Safety: a bulk delete needs at least one narrowing filter, never "everything".
  if (!g("q") && !g("source") && !g("bank") && !g("issue")) return;
  const res = await prisma.property.updateMany({ where: { AND: [where, { status: { not: "REMOVED" } }] }, data: { status: "REMOVED" } });
  refresh();
  redirect(`/admin/properties?status=REMOVED&bulk=${res.count}`);
}

/** Publish every currently-drafted property. Master admin only. */
export async function publishAllDrafts() {
  await requireMaster();
  const drafts = await prisma.property.findMany({ where: { status: "DRAFT" }, select: { id: true } });
  if (!drafts.length) {
    redirect("/admin/properties?status=PUBLISHED&published=0");
  }
  const ids = drafts.map((p) => p.id);
  const res = await prisma.property.updateMany({ where: { id: { in: ids }, status: "DRAFT" }, data: { status: "PUBLISHED" } });
  await prisma.propertyAttribute.deleteMany({ where: { propertyId: { in: ids }, key: "enrichment_status" } });
  refresh();
  redirect(`/admin/properties?status=PUBLISHED&published=${res.count}`);
}

export async function restoreProperty(formData: FormData) {
  const id = idOf(formData);
  if (!id) return;
  const p = await prisma.property.update({ where: { id }, data: { status: "PUBLISHED" } });
  refresh(p.slug);
}

const money = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[, ₹]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// Form times are entered in IST.
const istDate = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}:00+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL", "VEHICLE"];
const STATUSES = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "DUPLICATE", "EXPIRED", "REMOVED"];

export async function updateProperty(formData: FormData) {
  const id = idOf(formData);
  if (!id) return;
  const back = (msg: string) => redirect(`/admin/properties/${id}/edit?error=${encodeURIComponent(msg)}`);

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 5) back("Title must be at least 5 characters.");
  const category = String(formData.get("category") ?? "");
  const status = String(formData.get("status") ?? "");
  if (category && !CATEGORIES.includes(category)) back("Invalid category.");
  if (!STATUSES.includes(status)) back("Invalid status.");

  const reservePrice = money(formData.get("reservePrice"));
  const emd = money(formData.get("emd"));
  if (Number.isNaN(reservePrice) || Number.isNaN(emd)) back("Prices must be numbers.");
  const auctionStart = istDate(formData.get("auctionStart"));
  const auctionEnd = istDate(formData.get("auctionEnd"));
  const applicationDeadline = istDate(formData.get("applicationDeadline"));
  if (auctionStart === undefined || auctionEnd === undefined || applicationDeadline === undefined) back("A date is not valid.");

  const existing = await prisma.property.findUnique({ where: { id }, include: { auctions: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!existing) back("Property not found.");

  const text = (n: string) => String(formData.get(n) ?? "").trim() || null;

  await prisma.property.update({
    where: { id },
    data: {
      title,
      description: text("description"),
      addressText: text("addressText"),
      category: (category || null) as PropertyCategory | null,
      status: status as PropertyStatus,
    },
  });

  const a = existing!.auctions[0];
  if (a) {
    // Auction status: "AUTO" follows the dates; POSTPONED / CANCELLED are set by hand and then stay until the date changes.
    const choice = String(formData.get("auctionStatus") ?? "AUTO");
    const nextStatus = choice === "POSTPONED" || choice === "CANCELLED" ? choice : deriveAuctionStatusFromDates((auctionStart as Date | null) ?? null, (auctionEnd as Date | null) ?? null);
    if (nextStatus !== a.status) await recordAuctionStatusChange(a.id, a.status, nextStatus, `Set by admin (${choice})`);
    await prisma.auction.update({
      where: { id: a.id },
      data: {
        status: nextStatus,
        statusSource: choice === "AUTO" ? a.statusSource : "manual",
        reservePrice: reservePrice as number | null,
        emd: emd as number | null,
        auctionStart: auctionStart as Date | null,
        auctionEnd: auctionEnd as Date | null,
        applicationDeadline: applicationDeadline as Date | null,
        auctionMethod: text("auctionMethod"),
        possessionStatus: text("possessionStatus"),
      },
    });
  }

  refresh(existing!.slug);
  redirect("/admin/properties?saved=1");
}
