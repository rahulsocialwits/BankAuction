"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/** Bulk-assign a city to all properties that currently have no geoCity but have an addressText containing the city name. */
export async function bulkAssignCityByText(formData: FormData) {
  const city = String(formData.get("city") ?? "").trim();
  if (!city) return;
  // Only assign where geoCity is currently null and addressText contains the city name (case-insensitive)
  // Never overwrite existing manual assignments
  const { count } = await prisma.property.updateMany({
    where: {
      geoCity: null,
      addressText: { contains: city, mode: "insensitive" },
      status: { notIn: ["REMOVED", "DUPLICATE"] },
    },
    data: { geoCity: city, geoCheckedAt: new Date() },
  });
  revalidatePath("/admin/locations");
  void count;
}

/** Rename a city across all properties (preserves geoCheckedAt, records the rename). */
export async function renameCity(formData: FormData) {
  const oldCity = String(formData.get("oldCity") ?? "").trim();
  const newCity = String(formData.get("newCity") ?? "").trim();
  if (!oldCity || !newCity || oldCity === newCity) return;
  await prisma.property.updateMany({
    where: { geoCity: oldCity },
    data: { geoCity: newCity },
  });
  revalidatePath("/admin/locations");
}

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
