import PostForm from "../PostForm";
import { createBlogPost } from "../actions";

export default async function NewBlogPostPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-5">New Post</h1>
      <PostForm action={createBlogPost} error={error} />
    </div>
  );
}
