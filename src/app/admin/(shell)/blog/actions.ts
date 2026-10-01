"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/normalization/parsers";
import { MediaError, storeMedia } from "@/lib/media";

/** A picture chosen with the file box wins over the link box; it is saved in the Media Library and its address is used. */
async function coverFrom(formData: FormData): Promise<string | null> {
  const typed = String(formData.get("coverImageUrl") ?? "").trim() || null;
  const file = formData.get("coverFile");
  if (!(file instanceof File) || file.size === 0) return typed;
  const saved = await storeMedia({ name: file.name, contentType: file.type, data: Buffer.from(await file.arrayBuffer()) });
  return `/api/media/${saved.id}`;
}

function readPost(formData: FormData, coverImageUrl: string | null) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    excerpt: String(formData.get("excerpt") ?? "").trim() || null,
    body: String(formData.get("body") ?? "").trim(),
    coverImageUrl,
    category: String(formData.get("category") ?? "").trim().slice(0, 40) || null,
    tags: [...new Set(String(formData.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 8),
    seoTitle: String(formData.get("seoTitle") ?? "").trim().slice(0, 70) || null,
    seoDescription: String(formData.get("seoDescription") ?? "").trim().slice(0, 170) || null,
    status: formData.get("status") === "PUBLISHED" ? ("PUBLISHED" as const) : ("DRAFT" as const),
  };
}

async function cover(formData: FormData, back: string): Promise<string | null> {
  try {
    return await coverFrom(formData);
  } catch (e) {
    if (e instanceof MediaError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function createBlogPost(formData: FormData) {
  const data = readPost(formData, await cover(formData, "/admin/blog/new"));
  if (!data.title || !data.body) return;

  const baseSlug = slugify(data.title);
  const existing = await prisma.blogPost.findUnique({ where: { slug: baseSlug } });
  const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

  await prisma.blogPost.create({ data: { ...data, slug } });
  revalidatePath("/blog");
  redirect("/admin/blog");
}

export async function updateBlogPost(id: string, formData: FormData) {
  const data = readPost(formData, await cover(formData, `/admin/blog/${id}/edit`));
  await prisma.blogPost.update({ where: { id }, data });
  revalidatePath("/blog");
  revalidatePath(`/blog/${(await prisma.blogPost.findUnique({ where: { id } }))?.slug}`);
  redirect("/admin/blog");
}

export async function deleteBlogPost(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.blogPost.delete({ where: { id } });
  revalidatePath("/blog");
  revalidatePath("/admin/blog");
}
