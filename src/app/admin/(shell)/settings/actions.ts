"use server";

import { prisma } from "@/lib/db/prisma";
import { ensureSiteSettingsRow } from "@/lib/queries/siteSettings";
import { revalidatePath } from "next/cache";

export async function saveSiteSettings(formData: FormData) {
  const row = await ensureSiteSettingsRow();

  const field = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() || null : null;
  };

  await prisma.siteSettings.update({
    where: { id: row.id },
    data: {
      phone: field("phone"),
      generalEmail: field("generalEmail"),
      listingsEmail: field("listingsEmail"),
      partnershipsEmail: field("partnershipsEmail"),
      workingHours: field("workingHours"),
      facebookUrl: field("facebookUrl"),
      instagramUrl: field("instagramUrl"),
      linkedinUrl: field("linkedinUrl"),
      youtubeUrl: field("youtubeUrl"),
      privacyPolicy: field("privacyPolicy"),
      termsAndConditions: field("termsAndConditions"),
      disclaimer: field("disclaimer"),
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}
