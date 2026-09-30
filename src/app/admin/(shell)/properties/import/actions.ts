"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { importCsvText } from "@/lib/import/csvImport";
import { logRun } from "@/lib/pipeline/runLog";

export async function importProperties(formData: FormData) {
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!text.trim()) redirect("/admin/properties/import?error=empty");

  const startedAt = new Date();
  const res = await importCsvText(text, "csv-import");
  await logRun({
    source: "Bulk CSV import",
    kind: "csv",
    trigger: "import",
    status: res.error ? "error" : "ok",
    created: res.created,
    duplicates: res.skipped,
    rejected: res.failed,
    message: res.error ? 'CSV must have a header row with a "title" column' : undefined,
    startedAt,
  });
  if (res.error) redirect("/admin/properties/import?error=header");

  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect(`/admin/properties/import?created=${res.created}&skipped=${res.skipped}&failed=${res.failed}`);
}
