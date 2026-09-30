import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const revalidate = 120;

export default async function BlogPage() {
  const posts = await prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" } });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-2">Bank Auction Insights</h1>
      <p className="text-brand-muted text-sm mb-8">Guides on EMD, verification, and auction terminology.</p>

      {posts.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No articles published yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="bg-white border border-brand-border rounded-xl p-5 hover:border-brand transition-colors">
              <div className="font-semibold mb-1">{p.title}</div>
              {p.excerpt && <p className="text-sm text-brand-muted">{p.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
