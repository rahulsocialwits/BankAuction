"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
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
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back("Image uploaded and live.", true);
}

export async function removeSiteImage(formData: FormData) {
  await requireMaster();
  const key = String(formData.get("key") ?? "");
  await prisma.siteImage.deleteMany({ where: { key } });
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back("Image removed.", true);
}

export async function saveHomeConfig(formData: FormData) {
  await requireMaster();
  const text = (n: string, max: number) => String(formData.get(n) ?? "").trim().slice(0, max) || null;
  const cities: string[] = [];
  for (let i = 0; i < 8; i++) {
    const c = String(formData.get(`city_${i}`) ?? "").trim().slice(0, 40);
    if (c && !cities.some((x) => x.toLowerCase() === c.toLowerCase())) cities.push(c);
  }
  if (cities.length < 4) back("Keep at least 4 cities.");
  const data = { heroTitle: text("heroTitle", 120), heroSubtitle: text("heroSubtitle", 300), cities: JSON.stringify(cities) };
  await prisma.homeConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  updateTag(IMAGE_TAG);
  revalidatePath("/");
  back("Saved.", true);
}
