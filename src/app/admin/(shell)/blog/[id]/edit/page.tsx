import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import PostForm from "../../PostForm";
import { updateBlogPost } from "../../actions";

export default async function EditBlogPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  const boundUpdate = updateBlogPost.bind(null, id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-5">Edit Post</h1>
      <PostForm post={post} action={boundUpdate} error={error} />
    </div>
  );
}
