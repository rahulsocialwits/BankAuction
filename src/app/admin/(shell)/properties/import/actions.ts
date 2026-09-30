"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { importCsvText } from "@/lib/import/csvImport";

export async function importProperties(formData: FormData) {
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!text.trim()) redirect("/admin/properties/import?error=empty");

  const res = await importCsvText(text, "csv-import");
  if (res.error) redirect("/admin/properties/import?error=header");

  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect(`/admin/properties/import?created=${res.created}&skipped=${res.skipped}&failed=${res.failed}`);
}
