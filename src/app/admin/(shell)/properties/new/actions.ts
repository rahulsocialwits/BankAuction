"use server";

import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";
import { redirect } from "next/navigation";
import { PropertyCategory } from "@prisma/client";

export async function createManualProperty(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const category = formData.get("category") as PropertyCategory | "";
  const description = String(formData.get("description") ?? "").trim() || null;
  const addressText = String(formData.get("addressText") ?? "").trim() || null;
  const bankName = String(formData.get("bankName") ?? "").trim();
  const borrower = String(formData.get("borrower") ?? "").trim() || null;
  const reservePriceRaw = formData.get("reservePrice");
  const emdRaw = formData.get("emd");
  const auctionStartRaw = String(formData.get("auctionStart") ?? "");
  const auctionMethod = String(formData.get("auctionMethod") ?? "").trim() || null;
  const possessionStatus = String(formData.get("possessionStatus") ?? "").trim() || null;

  if (!title) return;

  const baseSlug = slugify(title);
  const existing = await prisma.property.findUnique({ where: { slug: baseSlug } });
  const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

  let bankId: string | undefined;
  if (bankName) {
    const bank = await prisma.bank.upsert({
      where: { name: bankName },
      update: {},
      create: { name: bankName, slug: slugify(bankName) },
    });
    bankId = bank.id;
  }

  const property = await prisma.property.create({
    data: {
      slug,
      title,
      category: category || undefined,
      description,
      addressText,
      status: "PUBLISHED",
    },
  });

  await prisma.auction.create({
    data: {
      propertyId: property.id,
      bankId,
      borrower,
      reservePrice: reservePriceRaw ? Number(reservePriceRaw) : undefined,
      emd: emdRaw ? Number(emdRaw) : undefined,
      auctionStart: auctionStartRaw ? new Date(auctionStartRaw) : undefined,
      auctionMethod,
      possessionStatus,
      status: "UPCOMING",
      statusSource: "manual",
    },
  });

  redirect("/admin/properties");
}
