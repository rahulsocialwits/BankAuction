import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";

export const IMAGE_TAG = "site-images";

/** Recommended sizes (desktop / mobile) for every slot the master admin can fill. */
export const SLOT_SPECS = {
  hero: { d: { w: 1440, h: 480 }, m: { w: 1080, h: 1350 } },
  city: { d: { w: 221, h: 148 }, m: { w: 221, h: 148 } },
  type: { d: { w: 236, h: 300 }, m: { w: 236, h: 300 } },
} as const;

export const PROPERTY_TYPE_TILES = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "LAND_PLOT", label: "Land & Plot" },
  { value: "AGRICULTURAL", label: "Agricultural" },
] as const;

export const DEFAULT_TILE_CITIES = ["Chennai", "Kolkata", "Bangalore", "Mumbai", "Surat", "Pune", "Hyderabad", "Agra"];

export const citySlugOf = (city: string) => city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const heroKey = (v: "d" | "m") => `hero-${v === "d" ? "desktop" : "mobile"}`;
export const cityKey = (city: string, v: "d" | "m") => `city-${citySlugOf(city)}-${v}`;
export const typeKey = (value: string, v: "d" | "m") => `type-${value}-${v}`;

/** key -> version (updatedAt ms) of every uploaded image. Tiny table; cached 5 minutes and refreshed on upload. */
export const getImageVersions = unstable_cache(
  async (): Promise<Record<string, number>> => {
    try {
      const rows = await prisma.siteImage.findMany({ select: { key: true, updatedAt: true } });
      return Object.fromEntries(rows.map((r) => [r.key, r.updatedAt.getTime()]));
    } catch {
      return {};
    }
  },
  ["site-image-versions"],
  { revalidate: 300, tags: [IMAGE_TAG] },
);

/** Public URL of an uploaded image (versioned so browsers cache it for a year), or null if none was uploaded. */
export const imageUrl = (versions: Record<string, number>, key: string): string | null => (versions[key] ? `/api/img/${encodeURIComponent(key)}?v=${versions[key]}` : null);

/** Width and height read from the file header (PNG, JPEG, WebP); null when not recognised. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const kind = buf.toString("ascii", 12, 16);
      if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
  } catch {
    /* fall through */
  }
  return null;
}
