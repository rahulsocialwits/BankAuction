"use server";

import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin } from "@/lib/auth/adminAuth";
import { ensureSiteSettingsRow, SETTINGS_TAG } from "@/lib/queries/siteSettings";
import { revalidatePath, updateTag } from "next/cache";
import type { SaveState } from "@/components/admin/SettingsForm";

const MAX_IMAGE_BYTES = 400 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/gif"];

export async function saveSiteSettings(_prev: SaveState, formData: FormData): Promise<SaveState> {
  if (!(await isMasterAdmin())) return { ok: false, message: "Only the master admin can do this." };
  try {
    await save(formData);
    return { ok: true, message: "Saved — live on the site now." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save. Please try again." };
  }
}

async function save(formData: FormData) {
  const row = await ensureSiteSettingsRow();

  const field = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() || null : null;
  };

  // An uploaded file wins over the URL box; "remove" clears back to the default.
  async function image(name: string): Promise<string | null | undefined> {
    if (formData.get(`${name}Remove`)) return null;
    const file = formData.get(`${name}File`);
    if (file instanceof File && file.size > 0) {
      if (!IMAGE_TYPES.includes(file.type)) throw new Error("Only PNG, JPG, WEBP, SVG, ICO or GIF images are allowed");
      if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be under 400 KB");
      const buf = Buffer.from(await file.arrayBuffer());
      return `data:${file.type};base64,${buf.toString("base64")}`;
    }
    const url = field(name);
    if (url && !/^(https:\/\/|\/|data:image\/)/.test(url)) throw new Error("Image URL must start with https:// or /");
    return url ?? undefined; // undefined = keep what is stored
  }

  const [headerLogoUrl, footerLogoUrl, faviconUrl] = await Promise.all([
    image("headerLogoUrl"),
    image("footerLogoUrl"),
    image("faviconUrl"),
  ]);

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
      homeTitle: field("homeTitle"),
      homeDescription: field("homeDescription"),
      homeKeywords: field("homeKeywords"),
      ...(headerLogoUrl !== undefined && { headerLogoUrl }),
      ...(footerLogoUrl !== undefined && { footerLogoUrl }),
      ...(faviconUrl !== undefined && { faviconUrl }),
    },
  });

  updateTag(SETTINGS_TAG);
  revalidatePath("/", "layout");
}
