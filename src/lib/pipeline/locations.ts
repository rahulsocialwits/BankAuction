import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

const ALIASES: Record<string, string> = {
  bengaluru: "Bangalore",
  bangalore: "Bangalore",
  bombay: "Mumbai",
  "navi mumbai": "Navi Mumbai",
  "new delhi": "Delhi",
  cochin: "Kochi",
  trivandrum: "Thiruvananthapuram",
  gurugram: "Gurgaon",
  vizag: "Visakhapatnam",
};

/** One spelling per city, so "kochi", "Kochi" and "Cochin" are a single entry in the filters. */
export function canonCity(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? titleCase(k);
}

const NOISE = /^(village|taluk|taluka|tehsil|district|dist|road|main road|and|at|of|the|india)$/i;

function cleanPart(part: string): string {
  return part
    .replace(/\b(village|taluk|taluka|tehsil|mandal|dist(?:rict)?|grampanchayat|gram panchayat|panchayat)\b\.?/gi, "")
    .replace(/^\s*at\s+/i, "")
    .replace(/\s+(and|&)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "")
    .trim();
}

/** Areas named in a title ("Flat at Mira Road, Thane" -> ["Mira Road"]), without the city itself. */
export function areasFromTitle(title: string, city: string): string[] {
  const m = title.match(/\bat\s+(.+)$/i);
  if (!m) return [];
  const cityKey = canonCity(city).toLowerCase();
  const parts = m[1]
    .replace(/\.+$/, "")
    .split(",")
    .map(cleanPart)
    .filter((p) => p.length >= 3 && p.length <= 32 && !NOISE.test(p) && !/\d{2,}/.test(p) && !/\band\b|&/i.test(p) && /^[a-z][a-z .'-]+$/i.test(p));
  return parts
    .filter((p) => canonCity(p).toLowerCase() !== cityKey)
    .slice(0, 2)
    .map(titleCase);
}

/**
 * Makes places that appear in listings selectable in the site's City / Area filters, so a listing in a new
 * area (Vasai, Mira Road …) needs no manual setup. The city is the property's location field (already clean);
 * areas come from the title. Only adds; never edits or removes admin-made entries.
 */
export async function syncLocationsFromProperties(): Promise<number> {
  const props = await prisma.property.findMany({
    where: { status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, addressText: { not: null } },
    select: { title: true, addressText: true },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });

  const existing = await prisma.locality.findMany({ select: { city: true, slug: true } });
  const have = new Set(existing.map((l) => `${canonCity(l.city).toLowerCase()}|${l.slug}`));
  const spelling = new Map<string, string>();
  for (const c of PRIORITY_CITIES) spelling.set(canonCity(c).toLowerCase(), c);
  for (const l of existing) if (!spelling.has(canonCity(l.city).toLowerCase())) spelling.set(canonCity(l.city).toLowerCase(), l.city);

  const toAdd = new Map<string, { city: string; name: string; slug: string }>();
  for (const p of props) {
    if (!p.addressText || p.addressText.length > 40) continue;
    const canon = canonCity(p.addressText);
    const city = spelling.get(canon.toLowerCase()) ?? canon;
    for (const area of areasFromTitle(p.title, p.addressText)) {
      const slug = slugify(area);
      const key = `${city.toLowerCase()}|${slug}`;
      if (slug && !have.has(key) && !toAdd.has(key)) toAdd.set(key, { city, name: area, slug });
    }
  }
  if (toAdd.size === 0) return 0;
  const res = await prisma.locality.createMany({
    data: [...toAdd.values()].map((l) => ({ ...l, sortOrder: 100, active: true })),
    skipDuplicates: true,
  });
  return res.count;
}
