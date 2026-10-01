"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin, requireMaster } from "@/lib/auth/adminAuth";
import { PAGE_KEYS, PAGE_META, cleanPage, type PageKey } from "@/lib/pages/content";
import { PAGES_TAG } from "@/lib/pages/store";
import { MediaError, storeMedia } from "@/lib/media";

export type PageFormState = { ok: boolean; message: string } | null;

const isKey = (k: unknown): k is PageKey => PAGE_KEYS.includes(k as PageKey);
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "");

function publish(key: PageKey) {
  updateTag(PAGES_TAG);
  revalidatePath(PAGE_META[key].path);
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/pages");
}

export async function savePage(_prev: PageFormState, formData: FormData): Promise<PageFormState> {
  if (!(await isMasterAdmin())) return { ok: false, message: "Only the master admin can do this." };
  const key = text(formData, "pageKey");
  if (!isKey(key)) return { ok: false, message: "Unknown page." };

  try {
    let raw: unknown;
    if (PAGE_META[key].kind === "about") {
      let imageUrl = text(formData, "imageUrl").trim();
      if (formData.get("removeImage")) imageUrl = "";
      const file = formData.get("imageFile");
      if (file instanceof File && file.size > 0) {
        const r = await storeMedia({ name: file.name, contentType: file.type, data: Buffer.from(await file.arrayBuffer()) });
        imageUrl = `/api/media/${r.id}`;
      }
      raw = {
        title: text(formData, "title"),
        intro: text(formData, "intro"),
        imageUrl,
        imageAlt: text(formData, "imageAlt"),
        missionTitle: text(formData, "missionTitle"),
        missionPoints: text(formData, "missionPoints"),
        visionTitle: text(formData, "visionTitle"),
        visionPoints: text(formData, "visionPoints"),
        buttonLabel: text(formData, "buttonLabel"),
        buttonHref: text(formData, "buttonHref"),
        seoTitle: text(formData, "seoTitle"),
        seoDescription: text(formData, "seoDescription"),
      };
    } else {
      raw = JSON.parse(text(formData, "content") || "{}");
    }
    const data = cleanPage(key, raw) as unknown as Prisma.InputJsonValue;
    await prisma.sitePage.upsert({ where: { key }, create: { key, data }, update: { data } });
    publish(key);
    return { ok: true, message: "Saved. The page is live now." };
  } catch (e) {
    if (e instanceof MediaError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not save. Please check the fields and try again." };
  }
}

/** Back to the built-in text for this page. */
export async function resetPage(formData: FormData) {
  await requireMaster();
  const key = text(formData, "pageKey");
  if (!isKey(key)) return;
  await prisma.sitePage.deleteMany({ where: { key } });
  publish(key);
  redirect(`/admin/pages/${key}?reset=1`);
}
