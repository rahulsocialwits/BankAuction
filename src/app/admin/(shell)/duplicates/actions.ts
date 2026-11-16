"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/** Mark property B as a duplicate of property A (keeps A, hides B). */
export async function mergeDuplicate(formData: FormData) {
  const keepId = String(formData.get("keepId") ?? "").trim();
  const hideId = String(formData.get("hideId") ?? "").trim();
  if (!keepId || !hideId || keepId === hideId) return;
  await prisma.property.update({
    where: { id: hideId },
    data: { status: "DUPLICATE" },
  });
  await prisma.propertyChange.create({
    data: {
      propertyId: keepId,
      field: "dedup_merge",
      newValue: hideId,
      detectedAt: new Date(),
    },
  });
  revalidatePath("/admin/duplicates");
}

/** Mark two properties as NOT duplicates — adds a note so they won't be paired again. */
export async function notDuplicate(formData: FormData) {
  const idA = String(formData.get("idA") ?? "").trim();
  const idB = String(formData.get("idB") ?? "").trim();
  if (!idA || !idB) return;
  // Record the "not same" decision in PropertyChange so the dedup engine can skip this pair
  await prisma.propertyChange.create({
    data: {
      propertyId: idA,
      field: "dedup_not_same",
      newValue: idB,
      detectedAt: new Date(),
    },
  });
  revalidatePath("/admin/duplicates");
}
