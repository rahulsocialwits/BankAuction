import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { dayLabel } from "@/lib/seo";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Bank Auction Insights",
  description: "Guides and updates on buying bank auction properties in India: SARFAESI, EMD, e-auction process, due diligence and more.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ category?: string; tag?: string }> }) {
  const { category, tag } = await searchParams;
  const all = await prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" } });
  const categories = [...new Set(all.map((p) => p.category).filter((c): c is string => !!c))];
  const posts = all.filter((p) => (!category || p.category === category) && (!tag || p.tags.includes(tag)));
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-xs ${on ? "border-brand bg-brand text-white" : "border-brand-border bg-white hover:border-brand"}`;

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold mb-2">Bank Auction Insights</h1>
      <p className="text-brand-muted text-sm mb-6">Guides on EMD, verification, and auction terminology.</p>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link href="/blog" className={chip(!category && !tag)}>All</Link>
          {categories.map((c) => <Link key={c} href={`/blog?category=${encodeURIComponent(c)}`} className={chip(category === c)}>{c}</Link>)}
          {tag && <span className={chip(true)}>#{tag}</span>}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No articles found.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group flex flex-col bg-white border border-brand-border rounded-xl overflow-hidden hover:border-brand hover:shadow-md transition">
              <div className="relative aspect-[16/10] bg-gradient-to-br from-brand to-brand-dark">
                {p.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                )}
                {p.category && <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-white">{p.category}</span>}
              </div>
              <div className="flex flex-1 flex-col p-3 sm:p-4">
                <div className="text-sm font-semibold leading-snug group-hover:text-brand">{p.title}</div>
                {p.excerpt && <p className="mt-1.5 text-xs sm:text-sm text-brand-muted line-clamp-3">{p.excerpt}</p>}
                <div className="mt-auto pt-3 text-[11px] text-brand-muted">{dayLabel(p.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
