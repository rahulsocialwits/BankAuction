import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { imageSize } from "@/lib/siteImages";

export const MEDIA_MAX_BYTES = 1.5 * 1024 * 1024;
export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A small preview (320px wide, WebP so transparent logos stay transparent). Null if the image tool is unavailable. */
async function makeThumb(data: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(data).rotate().resize({ width: 320, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  } catch {
    return null;
  }
}

export class MediaError extends Error {}

/**
 * Adds an image to the library. The same picture (same bytes) is stored only once: uploading it again just
 * returns the existing library entry.
 */
export async function storeMedia(input: { name: string; contentType: string; data: Buffer }) {
  if (!MEDIA_TYPES.includes(input.contentType)) throw new MediaError(`"${input.name}": use a JPG, PNG or WebP image.`);
  if (input.data.length > MEDIA_MAX_BYTES) {
    throw new MediaError(`"${input.name}" is ${(input.data.length / 1024 / 1024).toFixed(1)} MB. Keep each image under 1.5 MB (export as JPG or WebP at about 80% quality).`);
  }
  const hash = createHash("sha256").update(input.data).digest("hex");
  const existing = await prisma.mediaAsset.findUnique({ where: { hash }, select: { id: true, name: true } });
  if (existing) return { id: existing.id, name: existing.name, duplicate: true };

  const size = imageSize(input.data);
  const thumb = await makeThumb(input.data);
  const clean = input.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Image";
  const row = await prisma.mediaAsset.create({
    data: {
      name: clean,
      contentType: input.contentType,
      data: new Uint8Array(input.data),
      thumb: thumb ? new Uint8Array(thumb) : null,
      sizeBytes: input.data.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      hash,
    },
    select: { id: true, name: true },
  });
  return { id: row.id, name: row.name, duplicate: false };
}
