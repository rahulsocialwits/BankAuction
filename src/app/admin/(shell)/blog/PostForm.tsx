import type { BlogPost } from "@prisma/client";

export default function PostForm({ post, action }: { post?: BlogPost; action: (formData: FormData) => void }) {
  return (
    <form action={action} className="space-y-4 max-w-2xl bg-white border border-brand-border rounded-xl p-5">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input name="title" defaultValue={post?.title} required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Excerpt</label>
        <input name="excerpt" defaultValue={post?.excerpt ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Cover Image URL</label>
        <input name="coverImageUrl" defaultValue={post?.coverImageUrl ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Body</label>
        <textarea name="body" defaultValue={post?.body} required rows={10} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select name="status" defaultValue={post?.status ?? "DRAFT"} className="border border-brand-border rounded-lg px-3 py-2 text-sm">
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </div>
      <button type="submit" className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">
        Save
      </button>
    </form>
  );
}
