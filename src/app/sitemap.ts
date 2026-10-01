import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/prisma";
import { SITE_URL } from "@/lib/seo";
import { getCityCounts } from "@/lib/queries/cities";
import { PROPERTY_TYPE_TILES } from "@/lib/siteImages";

export const revalidate = 3600;

/** Every public page, so search engines can find new listings, cities, banks and articles without waiting to be linked. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages = ["", "/properties", "/banks", "/cities", "/property-types", "/how-it-works", "/blog", "/pricing", "/about", "/faq", "/contact", "/privacy-policy", "/terms-and-conditions", "/disclaimer"];

  const [properties, banks, posts, cities] = await Promise.all([
    prisma.property.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 40000 }).catch(() => []),
    prisma.bank.findMany({ where: { auctions: { some: { property: { status: "PUBLISHED" } } } }, select: { slug: true } }).catch(() => []),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }).catch(() => []),
    getCityCounts().catch(() => []),
  ]);

  return [
    ...staticPages.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: p === "" || p === "/properties" ? ("daily" as const) : ("weekly" as const), priority: p === "" ? 1 : p === "/properties" ? 0.9 : 0.6 })),
    ...PROPERTY_TYPE_TILES.map((t) => ({ url: `${SITE_URL}/property-type/${t.value.toLowerCase().replace(/_/g, "-")}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...cities.map((c) => ({ url: `${SITE_URL}/city/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...banks.map((b) => ({ url: `${SITE_URL}/bank/${b.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...properties.map((p) => ({ url: `${SITE_URL}/property/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
