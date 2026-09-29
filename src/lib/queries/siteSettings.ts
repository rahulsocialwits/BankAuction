import { prisma } from "@/lib/db/prisma";
import { DEFAULT_SITE_SETTINGS } from "@/lib/constants";

export async function getSiteSettings() {
  const row = await prisma.siteSettings.findFirst();
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
  };
}

export async function ensureSiteSettingsRow() {
  const existing = await prisma.siteSettings.findFirst();
  if (existing) return existing;
  return prisma.siteSettings.create({ data: {} });
}
