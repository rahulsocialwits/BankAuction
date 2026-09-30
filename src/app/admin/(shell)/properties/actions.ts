"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyCategory, PropertyStatus } from "@prisma/client";

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
    await prisma.auction.update({
      where: { id: a.id },
      data: {
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
