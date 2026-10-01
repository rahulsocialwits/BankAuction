"use server";

import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DocumentType, PropertyCategory } from "@prisma/client";
import { canonCity, titleCase } from "@/lib/pipeline/locations";
import { deriveAuctionStatusFromDates } from "@/lib/domain/deriveAuctionStatus";

const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "LAND_PLOT", "AGRICULTURAL"];
const DOC_TYPES = ["SALE_NOTICE", "AUCTION_NOTICE", "SALE_PROCLAMATION", "BID_FORM", "TERMS_AND_CONDITIONS", "PROPERTY_SCHEDULE", "POSSESSION_NOTICE", "DEMAND_NOTICE", "CORRIGENDUM", "INSPECTION_NOTICE", "APPLICATION_FORM", "OTHER"];
const MAX_DOCS = 6;
const MAX_EXTRA = 6;

const back = (msg: string): never => redirect(`/admin/properties/new?error=${encodeURIComponent(msg)}`);

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim() || null;
const money = (fd: FormData, n: string, label: string) => {
  const s = String(fd.get(n) ?? "").replace(/[,₹\s]/g, "");
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) back(`${label} must be a number.`);
  return v;
};
// Times are entered in IST.
const istDate = (fd: FormData, n: string, label: string) => {
  const s = String(fd.get(n) ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}:00+05:30`);
  if (Number.isNaN(d.getTime())) back(`${label} is not a valid date.`);
  return d;
};

export async function createManualProperty(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 8) back("Give the property a title of at least 8 characters.");
  const city = text(formData, "city");
  if (!city) back("City is required, so the property shows up in the right place.");

  const category = String(formData.get("category") ?? "");
  if (category && !CATEGORIES.includes(category)) back("Invalid category.");

  const reservePrice = money(formData, "reservePrice", "Reserve price");
  const emd = money(formData, "emd", "EMD");
  const minimumIncrement = money(formData, "minimumIncrement", "Minimum bid increment");
  const auctionStart = istDate(formData, "auctionStart", "Auction start");
  const auctionEnd = istDate(formData, "auctionEnd", "Auction end");
  const applicationDeadline = istDate(formData, "applicationDeadline", "Application deadline");
  const inspectionDate = istDate(formData, "inspectionDate", "Inspection date");
  if (auctionStart && auctionEnd && auctionEnd < auctionStart) back("Auction end is before the auction start.");

  // Documents: a row counts only when it has a link.
  const docs: { type: DocumentType; title: string | null; url: string }[] = [];
  for (let i = 0; i < MAX_DOCS; i++) {
    const url = String(formData.get(`doc_${i}_url`) ?? "").trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) back(`Document ${i + 1}: the link must start with https://`);
    const type = String(formData.get(`doc_${i}_type`) ?? "OTHER");
    docs.push({ type: (DOC_TYPES.includes(type) ? type : "OTHER") as DocumentType, title: text(formData, `doc_${i}_title`), url });
  }

  const baseSlug = slugify(title);
  const slug = (await prisma.property.findUnique({ where: { slug: baseSlug } })) ? `${baseSlug}-${Date.now()}` : baseSlug;

  const bankName = text(formData, "bankName");
  const bank = bankName ? await prisma.bank.upsert({ where: { name: bankName }, update: {}, create: { name: bankName, slug: slugify(bankName) } }) : null;
  const branchName = text(formData, "branchName");
  const branch = bank && branchName ? await prisma.bankBranch.upsert({ where: { bankId_name: { bankId: bank.id, name: branchName } }, update: {}, create: { bankId: bank.id, name: branchName } }) : null;

  const area = text(formData, "area");
  const publish = formData.get("publish") !== "draft";

  const property = await prisma.property.create({
    data: {
      slug,
      title,
      category: (category || undefined) as PropertyCategory | undefined,
      description: text(formData, "description"),
      addressText: text(formData, "addressText") ?? canonCity(city!),
      // Place entered by the admin is trusted: it is stored as the verified place, so the AI check skips it.
      geoCity: canonCity(city!),
      geoLocality: area ? titleCase(area) : null,
      geoState: text(formData, "state"),
      geoCheckedAt: new Date(),
      status: publish ? "PUBLISHED" : "DRAFT",
    },
  });

  const dsc = formData.get("dscRequired");
  await prisma.auction.create({
    data: {
      propertyId: property.id,
      bankId: bank?.id,
      branchId: branch?.id,
      noticeNumber: text(formData, "noticeNumber"),
      auctionMethod: text(formData, "auctionMethod"),
      borrower: text(formData, "borrower"),
      authorizedOfficer: text(formData, "officerName"),
      officerDesignation: text(formData, "officerDesignation"),
      officerPhone: text(formData, "officerPhone"),
      officerEmail: text(formData, "officerEmail"),
      reservePrice: reservePrice ?? undefined,
      emd: emd ?? undefined,
      minimumIncrement: minimumIncrement ?? undefined,
      auctionStart: auctionStart ?? undefined,
      auctionEnd: auctionEnd ?? undefined,
      applicationDeadline: applicationDeadline ?? undefined,
      inspectionDate: inspectionDate ?? undefined,
      inspectionTime: text(formData, "inspectionTime"),
      inspectionLocation: text(formData, "inspectionLocation"),
      inspectionContact: text(formData, "inspectionContact"),
      possessionStatus: text(formData, "possessionStatus"),
      dscRequired: dsc === "yes" ? true : dsc === "no" ? false : undefined,
      status: deriveAuctionStatusFromDates(auctionStart ?? null, auctionEnd ?? null),
      statusSource: "manual",
    },
  });

  // Free-form details: the legal schedule (shown on the property page) and any extra label/value pairs.
  const attrs: { key: string; value: string }[] = [];
  const legal = text(formData, "legalSchedule");
  if (legal) attrs.push({ key: "legal_schedule", value: legal });
  const listedType = text(formData, "listedType");
  if (listedType) attrs.push({ key: "source_property_type", value: listedType });
  const size = text(formData, "areaSize");
  if (size) attrs.push({ key: "area_size", value: size });
  for (let i = 0; i < MAX_EXTRA; i++) {
    const label = text(formData, `extra_${i}_label`);
    const value = text(formData, `extra_${i}_value`);
    if (label && value) attrs.push({ key: slugify(label).replace(/-/g, "_").slice(0, 60) || `detail_${i}`, value });
  }
  if (attrs.length) {
    await prisma.propertyAttribute.createMany({ data: attrs.map((a) => ({ propertyId: property.id, key: a.key, value: a.value })), skipDuplicates: true });
  }

  for (const d of docs) {
    const doc = await prisma.document.upsert({
      where: { sourceUrl: d.url },
      update: { title: d.title ?? undefined, type: d.type },
      create: { type: d.type, title: d.title, sourceUrl: d.url, storedUrl: d.url },
    });
    await prisma.propertyDocument.upsert({
      where: { propertyId_documentId: { propertyId: property.id, documentId: doc.id } },
      update: {},
      create: { propertyId: property.id, documentId: doc.id },
    });
  }

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");
  redirect("/admin/properties?saved=1");
}
