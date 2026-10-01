"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { MediaError, storeMedia } from "@/lib/media";

const go = (kind: "ok" | "error", msg: string): never => redirect(`/admin/media?${kind}=${encodeURIComponent(msg)}`);

export async function uploadMedia(formData: FormData) {
  await requireMaster();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) go("error", "Choose one or more images first.");

  let added = 0;
  let already = 0;
  const problems: string[] = [];
  for (const f of files) {
    try {
      const r = await storeMedia({ name: f.name, contentType: f.type, data: Buffer.from(await f.arrayBuffer()) });
      if (r.duplicate) already++;
      else added++;
    } catch (e) {
      problems.push(e instanceof MediaError ? e.message : `"${f.name}" could not be saved.`);
    }
  }
  revalidatePath("/admin/media");
  const parts = [added && `${added} uploaded`, already && `${already} already in the library`].filter(Boolean).join(", ");
  if (problems.length && !added && !already) go("error", problems.join(" "));
  go("ok", `${parts || "Nothing new"}${problems.length ? `. Skipped: ${problems.join(" ")}` : "."}`);
}

export async function renameMedia(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (name) await prisma.mediaAsset.updateMany({ where: { id }, data: { name } });
  revalidatePath("/admin/media");
}

export async function deleteMedia(formData: FormData) {
  await requireMaster();
  await prisma.mediaAsset.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/admin/media");
  go("ok", "Image deleted from the library. Pictures already placed on the site stay as they are.");
}
