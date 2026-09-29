"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";

export async function approveProperty(formData: FormData) {
  const propertyId = formData.get("propertyId");
  if (typeof propertyId !== "string" || !propertyId) return;

  await prisma.property.update({
    where: { id: propertyId },
    data: { status: "PUBLISHED" },
  });

  revalidatePath("/admin/properties");
}

export async function rejectProperty(formData: FormData) {
  const propertyId = formData.get("propertyId");
  if (typeof propertyId !== "string" || !propertyId) return;

  await prisma.property.update({
    where: { id: propertyId },
    data: { status: "DRAFT" },
  });

  revalidatePath("/admin/properties");
}
