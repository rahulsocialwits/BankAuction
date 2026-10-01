"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin } from "@/lib/auth/adminAuth";
import { generateApiKey } from "@/lib/apiKeys";

export type KeyFormState = { ok: boolean; message: string; key?: string } | null;

/** Creates a key and returns it once. Only a hash is stored, so it can never be shown again. */
export async function createApiKey(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  if (!(await isMasterAdmin())) return { ok: false, message: "Only the master admin can do this." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (name.length < 2) return { ok: false, message: "Give the key a name (who will use it), for example “Partner app”." };
  if ((await prisma.apiKey.count()) >= 50) return { ok: false, message: "You already have 50 keys. Delete the ones you no longer use." };

  const { key, prefix, hash } = generateApiKey();
  await prisma.apiKey.create({ data: { name, note, prefix, keyHash: hash } });
  revalidatePath("/admin/api");
  return { ok: true, message: "Key created. Copy it now: it will not be shown again.", key };
}

export async function toggleApiKey(formData: FormData) {
  if (!(await isMasterAdmin())) return;
  const id = String(formData.get("id") ?? "");
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (k) await prisma.apiKey.update({ where: { id }, data: { active: !k.active } });
  revalidatePath("/admin/api");
}

export async function deleteApiKey(formData: FormData) {
  if (!(await isMasterAdmin())) return;
  await prisma.apiKey.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/admin/api");
}
