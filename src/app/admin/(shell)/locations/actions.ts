"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

export async function assignCity(formData: FormData) {
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!propertyId || !city) return;
  await prisma.property.update({
    where: { id: propertyId },
    data: { geoCity: city, geoCheckedAt: new Date() },
  });
  revalidatePath("/admin/locations");
  revalidatePath(`/admin/properties/${propertyId}/edit`);
}

export async function unassignCity(formData: FormData) {
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  if (!propertyId) return;
  await prisma.property.update({
    where: { id: propertyId },
    data: { geoCity: null, geoLocality: null },
  });
  revalidatePath("/admin/locations");
  revalidatePath(`/admin/properties/${propertyId}/edit`);
}
