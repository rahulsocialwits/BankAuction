import PostForm from "../PostForm";
import { createBlogPost } from "../actions";

export default function NewBlogPostPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-5">New Post</h1>
      <PostForm action={createBlogPost} />
    </div>
  );
}
