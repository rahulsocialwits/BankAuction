"use server";

import { requireMaster } from "@/lib/auth/adminAuth";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { importTabular } from "@/lib/import/tabular";
import { logRun } from "@/lib/pipeline/runLog";
import { enrichLocations } from "@/lib/pipeline/geo";

export async function importProperties(formData: FormData) {
  await requireMaster();
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!text.trim()) redirect("/admin/properties/import?error=empty");

  const startedAt = new Date();
  // Our template goes straight in; any other column layout is read by the AI (columns mapped once, rows imported in code).
  const res = await importTabular(text, "csv-import", { force: true });
  const reason = res.skippedReason;
  await logRun({
    source: "Bulk CSV import",
    kind: "csv",
    trigger: "import",
    status: reason ? "error" : "ok",
    created: res.created,
    duplicates: res.skipped,
    rejected: res.failed,
    aiTokens: res.tokens,
    message: reason ? `Skipped: ${reason}` : res.usedAi ? "Columns mapped by AI" : undefined,
    startedAt,
  });
  if (reason) redirect(`/admin/properties/import?error=ai&reason=${encodeURIComponent(reason)}`);
  if (res.created > 0) await enrichLocations(60).catch(() => null);

  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect(`/admin/properties/import?created=${res.created}&skipped=${res.skipped}&failed=${res.failed}`);
}
