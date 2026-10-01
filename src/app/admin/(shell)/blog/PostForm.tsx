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
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <input name="category" list="blog-cats" defaultValue={post?.category ?? ""} placeholder="e.g. Guides" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <datalist id="blog-cats"><option value="Guides" /><option value="Property" /><option value="Banks" /><option value="Legal" /><option value="News" /></datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tags <span className="font-normal text-brand-muted">(comma separated)</span></label>
          <input name="tags" defaultValue={post?.tags?.join(", ") ?? ""} placeholder="sarfaesi, emd, e-auction" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Cover Image URL</label>
        <input name="coverImageUrl" defaultValue={post?.coverImageUrl ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Body <span className="font-normal text-brand-muted">(blank line = new paragraph, "- " = bullet, **bold**)</span></label>
        <textarea name="body" defaultValue={post?.body} required rows={10} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
      </div>
      <fieldset className="border border-brand-border rounded-lg p-4 space-y-3">
        <legend className="px-1 text-sm font-medium">SEO</legend>
        <div>
          <label className="block text-xs font-medium mb-1">SEO title <span className="font-normal text-brand-muted">(up to 70 characters; blank = the post title)</span></label>
          <input name="seoTitle" maxLength={70} defaultValue={post?.seoTitle ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">SEO description <span className="font-normal text-brand-muted">(up to 170 characters; blank = the excerpt)</span></label>
          <textarea name="seoDescription" rows={2} maxLength={170} defaultValue={post?.seoDescription ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
      </fieldset>
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
