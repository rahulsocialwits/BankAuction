"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { runFeedSource, validateFeedUrl } from "@/data-sources/feeds/run";

export async function addFeed(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const check = validateFeedUrl(String(formData.get("url") ?? ""));
  if (!name) redirect("/admin/feeds?error=" + encodeURIComponent("Name is required"));
  if (!check.ok) redirect("/admin/feeds?error=" + encodeURIComponent(check.reason));
  if (await prisma.feedSource.findUnique({ where: { name } })) redirect("/admin/feeds?error=" + encodeURIComponent("Name already exists"));

  const feed = await prisma.feedSource.create({ data: { name, url: check.url, lastMessage: "Fetching…" } });
  // Import can take a while for big sheets; run after the response so the page never hangs.
  after(() => runFeedSource(feed.id));
  revalidatePath("/admin/feeds");
  redirect("/admin/feeds");
}

export async function toggleFeed(formData: FormData) {
  const id = String(formData.get("id"));
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (feed) await prisma.feedSource.update({ where: { id }, data: { active: !feed.active } });
  revalidatePath("/admin/feeds");
}

export async function deleteFeed(formData: FormData) {
  await prisma.feedSource.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/feeds");
}

export async function runFeedNow(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.feedSource.update({ where: { id }, data: { lastMessage: "Fetching…" } });
  after(() => runFeedSource(id));
  revalidatePath("/admin/feeds");
}
