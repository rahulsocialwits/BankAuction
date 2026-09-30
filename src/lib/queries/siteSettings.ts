import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_SITE_SETTINGS } from "@/lib/constants";

// Cached: the header and footer read this on every page. Invalidated by the admin settings save.
export const SETTINGS_TAG = "site-settings";

const LEGACY_HOME_DESCRIPTION =
  "Discover Indian bank-auction properties — residential, commercial, industrial, agricultural, land and vehicles — sourced and verified from public auction listings.";

type Row = Awaited<ReturnType<typeof prisma.siteSettings.findFirst>>;

export function buildSettings(row: Row) {
  return {
      phone: row?.phone || DEFAULT_SITE_SETTINGS.phone,
      generalEmail: row?.generalEmail || DEFAULT_SITE_SETTINGS.generalEmail,
      listingsEmail: row?.listingsEmail || DEFAULT_SITE_SETTINGS.listingsEmail,
      partnershipsEmail: row?.partnershipsEmail || DEFAULT_SITE_SETTINGS.partnershipsEmail,
      workingHours: row?.workingHours || DEFAULT_SITE_SETTINGS.workingHours,
      facebookUrl: row?.facebookUrl || DEFAULT_SITE_SETTINGS.facebookUrl,
      instagramUrl: row?.instagramUrl || DEFAULT_SITE_SETTINGS.instagramUrl,
      linkedinUrl: row?.linkedinUrl || DEFAULT_SITE_SETTINGS.linkedinUrl,
      youtubeUrl: row?.youtubeUrl || DEFAULT_SITE_SETTINGS.youtubeUrl,
      privacyPolicy: row?.privacyPolicy || DEFAULT_SITE_SETTINGS.privacyPolicy,
      termsAndConditions: row?.termsAndConditions || DEFAULT_SITE_SETTINGS.termsAndConditions,
      disclaimer: row?.disclaimer || DEFAULT_SITE_SETTINGS.disclaimer,
      headerLogoUrl: row?.headerLogoUrl || "/brand/logo.png",
      footerLogoUrl: row?.footerLogoUrl || row?.headerLogoUrl || "/brand/logo.png",
      faviconUrl: row?.faviconUrl || "",
      homeTitle: row?.homeTitle || "BankAuction.co — Indian Bank Auction Property Discovery",
      // Empty (or the old built-in text) means "write it automatically from live data" — see the site layout.
      homeDescription: row?.homeDescription && row.homeDescription !== LEGACY_HOME_DESCRIPTION ? row.homeDescription : "",
      homeKeywords: row?.homeKeywords || "",
  };
}

const cachedSettings = unstable_cache(
  async () => buildSettings(await prisma.siteSettings.findFirst()),
  ["site-settings"],
  { revalidate: 300, tags: [SETTINGS_TAG] },
);

/** A DB hiccup (e.g. pool timeout during build) renders defaults instead of failing the page; failures are not cached. */
export async function getSiteSettings() {
  try {
    return await cachedSettings();
  } catch {
    return buildSettings(null);
  }
}

export async function ensureSiteSettingsRow() {
  const existing = await prisma.siteSettings.findFirst();
  if (existing) return existing;
  return prisma.siteSettings.create({ data: {} });
}
