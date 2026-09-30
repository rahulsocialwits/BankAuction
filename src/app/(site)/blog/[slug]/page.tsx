import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { clip } from "@/lib/seo";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug }, select: { title: true, body: true, status: true } });
  if (!post || post.status !== "PUBLISHED") return { title: "Article not found", robots: { index: false } };
  const description = clip(post.body, 158);
  return { title: post.title, description, alternates: { canonical: `/blog/${slug}` }, openGraph: { title: post.title, description, type: "article" } };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-4">{post.title}</h1>
      <div className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{post.body}</div>
    </main>
  );
}
