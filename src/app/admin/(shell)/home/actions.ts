"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { storeMedia } from "@/lib/media";
import { DEFAULT_TILE_CITIES, IMAGE_TAG, PROPERTY_TYPE_TILES, citySlugOf, imageSize } from "@/lib/siteImages";

const MAX_BYTES = 1.5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function back(msg: string, ok = false): never {
  return redirect(`/admin/home?${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
}

async function allowedKeys(): Promise<Set<string>> {
  const cfg = await prisma.homeConfig.findUnique({ where: { id: "default" } });
  let cities: string[] = [];
  try {
    cities = cfg?.cities ? (JSON.parse(cfg.cities) as string[]) : [];
  } catch {
    /* defaults below */
  }
  if (cities.length === 0) cities = DEFAULT_TILE_CITIES; // nothing saved yet: the default eight
  const keys = new Set<string>(["hero-desktop", "hero-mobile"]);
  for (const c of cities) for (const v of ["d", "m"]) keys.add(`city-${citySlugOf(c)}-${v}`);
  for (const t of PROPERTY_TYPE_TILES) for (const v of ["d", "m"]) keys.add(`type-${t.value}-${v}`);
  return keys;
}

export async function uploadSiteImage(formData: FormData) {
  await requireMaster();
  const key = String(formData.get("key") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("Choose an image file first.");
  const f = file as File;
  if (!TYPES.includes(f.type)) back("Use a JPG, PNG or WebP image.");
  if (f.size > MAX_BYTES) back(`That image is ${(f.size / 1024 / 1024).toFixed(1)} MB. Keep it under 1.5 MB (export as JPG or WebP at 80% quality).`);
  if (!(await allowedKeys()).has(key)) back("Unknown image slot.");

  const data = Buffer.from(await f.arrayBuffer());
  const size = imageSize(data);
  await prisma.siteImage.upsert({
    where: { key },
    create: { key, contentType: f.type, data, sizeBytes: data.length, width: size?.width ?? null, height: size?.height ?? null },
    update: { contentType: f.type, data, sizeBytes: data.length, width: size?.width ?? null, height: size?.height ?? null },
  });
  // Everything uploaded here also lands in the Media Library, ready to reuse elsewhere.
  await storeMedia({ name: f.name, contentType: f.type, data }).catch(() => null);
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/media");
  back("Image uploaded and live (and saved in the Media Library).", true);
}

/** Puts a picture that is already in the Media Library into a Home Page slot: no upload needed. */
export async function chooseLibraryImage(formData: FormData) {
  await requireMaster();
  const key = String(formData.get("key") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!(await allowedKeys()).has(key)) back("Unknown image slot.");
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) back("That picture is no longer in the library.");
  const a = asset!;
  const data = new Uint8Array(a.data);
  await prisma.siteImage.upsert({
    where: { key },
    create: { key, contentType: a.contentType, data, sizeBytes: a.sizeBytes, width: a.width, height: a.height },
    update: { contentType: a.contentType, data, sizeBytes: a.sizeBytes, width: a.width, height: a.height },
  });
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back(`"${a.name}" is now live in that slot.`, true);
}

export async function removeSiteImage(formData: FormData) {
  await requireMaster();
  const key = String(formData.get("key") ?? "");
  await prisma.siteImage.deleteMany({ where: { key } });
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back("Image removed.", true);
}

/**
 * Saves only what the submitted form contains: the hero text form, or the "order of tiles" form. Each leaves the
 * other's data alone, so saving one can never wipe the other.
 */
export async function saveHomeConfig(formData: FormData) {
  await requireMaster();
  const data: { heroTitle?: string | null; heroSubtitle?: string | null; cities?: string; typeOrder?: string } = {};
  const text = (n: string, max: number) => String(formData.get(n) ?? "").trim().slice(0, max) || null;

  if (formData.has("heroTitle") || formData.has("heroSubtitle")) {
    data.heroTitle = text("heroTitle", 120);
    data.heroSubtitle = text("heroSubtitle", 300);
  }

  if (formData.has("city_0")) {
    const cities: string[] = [];
    for (let i = 0; i < 8; i++) {
      const c = String(formData.get(`city_${i}`) ?? "").trim().slice(0, 40);
      if (c && !cities.some((x) => x.toLowerCase() === c.toLowerCase())) cities.push(c);
    }
    if (cities.length < 4) back("Keep at least 4 cities.");
    data.cities = JSON.stringify(cities);
  }

  if (formData.has("type_0")) {
    // Property-type cards: only known values, in the arranged order; none can be lost.
    const valid = PROPERTY_TYPE_TILES.map((t) => t.value) as string[];
    const order: string[] = [];
    for (let i = 0; i < valid.length; i++) {
      const v = String(formData.get(`type_${i}`) ?? "");
      if (valid.includes(v) && !order.includes(v)) order.push(v);
    }
    for (const v of valid) if (!order.includes(v)) order.push(v);
    data.typeOrder = JSON.stringify(order);
  }

  await prisma.homeConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back("Saved. The home page shows the new order now.", true);
}