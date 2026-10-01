"use server";

import { requireMaster } from "@/lib/auth/adminAuth";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { ensureSourceRow } from "@/data-sources/bankauctions/adapter";
import { runFeedSource } from "@/data-sources/feeds/run";

function refresh() {
  revalidatePath("/admin/engine");
  revalidatePath("/admin/feeds");
}

/** Pause / resume the built-in BankAuctions.in crawler. */
export async function toggleBuiltIn() {
  await requireMaster();
  const row = await ensureSourceRow();
  await prisma.source.update({
    where: { id: row.id },
    data: { status: row.status === "DISABLED" ? "HEALTHY" : "DISABLED" },
  });
  refresh();
}

export async function toggleFeedSource(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (feed) {
    const active = !feed.active;
    await prisma.feedSource.update({ where: { id }, data: { active, ...(active && { lastMessage: "Fetching…" }) } });
    if (active) after(() => runFeedSource(id)); // "Run" = start now, then automatic until paused
  }
  refresh();
}

/** Remove a link source for good (used for sources that refuse automated access). */
export async function deleteFeedSource(formData: FormData) {
  await requireMaster();
  await prisma.feedSource.deleteMany({ where: { id: String(formData.get("id")) } });
  refresh();
}

export async function runFeedSourceNow(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  await prisma.feedSource.update({ where: { id }, data: { lastMessage: "Fetching…" } });
  after(() => runFeedSource(id));
  refresh();
}
