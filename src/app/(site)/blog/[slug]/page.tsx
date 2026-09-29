import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";

export const revalidate = 120;

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  return (
    <main className="max-w-3xl mx-auto px-5 py-14">
      <h1 className="text-2xl font-semibold mb-4">{post.title}</h1>
      <div className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{post.body}</div>
    </main>
  );
}
