"use server";

import { requireMaster } from "@/lib/auth/adminAuth";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { findDuplicateGroups } from "@/lib/pipeline/duplicates";

function refresh() {
  revalidatePath("/admin/engine/duplicates");
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");
}

/** Hide the listed properties as duplicates (kept in the database, never re-published by imports). */
export async function markDuplicates(formData: FormData) {
  await requireMaster();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length) await prisma.property.updateMany({ where: { id: { in: ids } }, data: { status: "DUPLICATE" } });
  refresh();
}

/** Keep the oldest of every group whose titles are clearly alike; hide the rest. */
export async function cleanObviousDuplicates() {
  await requireMaster();
  const groups = await findDuplicateGroups();
  const ids = groups.filter((g) => g.similarity >= 0.6).flatMap((g) => g.members.slice(1).map((m) => m.id));
  if (ids.length) await prisma.property.updateMany({ where: { id: { in: ids } }, data: { status: "DUPLICATE" } });
  refresh();
}
