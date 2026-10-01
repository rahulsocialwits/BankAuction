"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/normalization/parsers";

function readPost(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    excerpt: String(formData.get("excerpt") ?? "").trim() || null,
    body: String(formData.get("body") ?? "").trim(),
    coverImageUrl: String(formData.get("coverImageUrl") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim().slice(0, 40) || null,
    tags: [...new Set(String(formData.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 8),
    seoTitle: String(formData.get("seoTitle") ?? "").trim().slice(0, 70) || null,
    seoDescription: String(formData.get("seoDescription") ?? "").trim().slice(0, 170) || null,
    status: formData.get("status") === "PUBLISHED" ? ("PUBLISHED" as const) : ("DRAFT" as const),
  };
}

export async function createBlogPost(formData: FormData) {
  const data = readPost(formData);
  if (!data.title || !data.body) return;

  const baseSlug = slugify(data.title);
  const existing = await prisma.blogPost.findUnique({ where: { slug: baseSlug } });
  const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

  await prisma.blogPost.create({ data: { ...data, slug } });
  revalidatePath("/blog");
  redirect("/admin/blog");
}

export async function updateBlogPost(id: string, formData: FormData) {
  const data = readPost(formData);
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
