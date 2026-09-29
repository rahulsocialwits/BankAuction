import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { deleteBlogPost } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBlogListPage() {
  const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-brand mb-1">Blog</h1>
          <p className="text-sm text-brand-muted">Posts shown in the homepage carousel and /blog.</p>
        </div>
        <Link href="/admin/blog/new" className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark">
          New Post
        </Link>
      </div>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Updated</th>
              <th className="px-4 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-muted">No posts yet.</td></tr>
            )}
            {posts.map((p) => (
              <tr key={p.id} className="border-t border-brand-border">
                <td className="px-4 py-3">{p.title}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${p.status === "PUBLISHED" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-brand-muted">{new Date(p.updatedAt).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/blog/${p.id}/edit`} className="text-brand text-xs font-medium hover:underline">Edit</Link>
                    <form action={deleteBlogPost}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-red-600 text-xs font-medium hover:underline">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
