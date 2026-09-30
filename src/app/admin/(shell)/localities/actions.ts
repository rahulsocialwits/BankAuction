"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";

function refresh() {
  revalidateTag("localities", "max");
  revalidatePath("/admin/localities");
  revalidatePath("/");
  revalidatePath("/properties");
}

export async function addLocalities(formData: FormData) {
  const city = String(formData.get("city") ?? "").trim();
  const raw = String(formData.get("names") ?? "");
  if (!city) return;

  const names = [...new Set(raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean))];
  const existing = await prisma.locality.count({ where: { city } });

  for (const [i, name] of names.entries()) {
    const slug = slugify(name);
    if (!slug) continue;
    await prisma.locality.upsert({
      where: { city_slug: { city, slug } },
      update: { name, active: true },
      create: { city, name, slug, sortOrder: existing + i },
    });
  }
  refresh();
}

export async function toggleLocality(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const row = await prisma.locality.findUnique({ where: { id } });
  if (!row) return;
  await prisma.locality.update({ where: { id }, data: { active: !row.active } });
  refresh();
}

export async function deleteLocality(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.locality.deleteMany({ where: { id } });
  refresh();
}
