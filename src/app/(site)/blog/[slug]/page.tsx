import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SITE_URL, clip, dayLabel } from "@/lib/seo";
import RichText from "@/components/RichText";
import JsonLd from "@/components/JsonLd";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") return { title: "Article not found", robots: { index: false } };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || clip(post.body, 158);
  return {
    title,
    description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title, description, type: "article", publishedTime: post.createdAt.toISOString(), modifiedTime: post.updatedAt.toISOString(), images: post.coverImageUrl ? [post.coverImageUrl] : undefined },
  };
}

function Thumb({ src, className = "" }: { src: string | null; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand to-brand-dark ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  const [others, categoryRows] = await Promise.all([
    prisma.blogPost.findMany({ where: { status: "PUBLISHED", id: { not: post.id } }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED", category: { not: null } }, select: { category: true } }),
  ]);
  // Featured: same category first, then the newest; Recent: the newest.
  const featured = [...others.filter((o) => post.category && o.category === post.category), ...others.filter((o) => !post.category || o.category !== post.category)].slice(0, 3);
  const recent = others.slice(0, 4);
  const counts = new Map<string, number>();
  for (const r of categoryRows) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const minutes = Math.max(1, Math.round(post.body.split(/\s+/).length / 200));

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.seoTitle || post.title,
          description: post.seoDescription || post.excerpt || clip(post.body, 158),
          datePublished: post.createdAt.toISOString(),
          dateModified: post.updatedAt.toISOString(),
          image: post.coverImageUrl || undefined,
          keywords: post.tags.join(", ") || undefined,
          mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
        }}
      />

      {/* Title band */}
      <section className="bg-brand text-white">
        <div className="w-full px-5 lg:px-10 xl:px-16 pt-8 pb-24 sm:pb-28 lg:pb-32">
          <nav className="text-xs text-white/70 mb-4">
            <Link href="/" className="hover:text-white">Home</Link> / <Link href="/blog" className="hover:text-white">Insights</Link>
            {post.category && <> / <span className="text-white/90">{post.category}</span></>}
          </nav>
          {post.category && (
            <Link href={`/blog?category=${encodeURIComponent(post.category)}`} className="inline-block rounded-full bg-gold px-3 py-1 text-xs font-semibold text-white mb-3">{post.category}</Link>
          )}
          <h1 className="max-w-4xl text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{post.title}</h1>
          {post.excerpt && <p className="mt-3 max-w-3xl text-sm sm:text-base text-white/75">{post.excerpt}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
            <span>{dayLabel(post.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{minutes} min read</span>
            <span aria-hidden="true">·</span>
            <span>BankAuction.co Team</span>
          </div>
        </div>
      </section>

      <div className="w-full px-5 lg:px-10 xl:px-16 -mt-16 sm:-mt-20 lg:-mt-24 pb-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
        {/* Article card */}
        <article className="min-w-0 rounded-2xl border border-brand-border bg-white p-5 sm:p-8 lg:p-10 shadow-sm">
          {post.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImageUrl} alt="" className="mx-auto mb-6 w-full max-w-[400px] rounded-xl aspect-[400/270] object-cover" />
          )}
          <RichText text={post.body} className="text-[15px] sm:text-base leading-7 sm:leading-8 text-black/80" />

          {post.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-brand-border pt-5">
              <span className="text-xs font-semibold text-brand-muted mr-1">Tags</span>
              {post.tags.map((t) => (
                <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs text-brand-muted hover:border-brand hover:text-brand">#{t}</Link>
              ))}
            </div>
          )}

          <div className="mt-8 rounded-xl bg-brand p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <div className="font-semibold">Looking for a bank auction property?</div>
              <p className="mt-1 text-sm text-white/75">Browse verified listings with links to the official sale notices.</p>
            </div>
            <Link href="/properties" className="mt-4 sm:mt-0 inline-block shrink-0 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-white hover:bg-gold-dark">Explore Auctions</Link>
          </div>
        </article>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-32">
          <div className="rounded-2xl border border-brand-border bg-white p-5 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-gold">B</span>
            <div className="mt-3 text-sm font-semibold">BankAuction.co Team</div>
            <div className="text-xs text-brand-muted">Published {dayLabel(post.createdAt)}</div>
            {post.category && <div className="mt-1 text-xs text-brand-muted">Filed under <Link href={`/blog?category=${encodeURIComponent(post.category)}`} className="text-brand underline">{post.category}</Link></div>}
          </div>

          {featured.length > 0 && (
            <div className="rounded-2xl border border-brand-border bg-white p-5">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-brand-muted">Featured posts</h2>
              <ul className="space-y-4">
                {featured.map((f) => (
                  <li key={f.id}>
                    <Link href={`/blog/${f.slug}`} className="group flex items-center gap-3">
                      <Thumb src={f.coverImageUrl} className="h-16 w-20" />
                      <span className="text-sm font-medium leading-snug line-clamp-3 group-hover:text-brand">{f.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recent.length > 0 && (
            <div className="rounded-2xl border border-brand-border bg-white p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-muted">Recent posts</h2>
              <ul className="divide-y divide-brand-border">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/blog/${r.slug}`} className="block py-2.5 text-sm hover:text-brand">
                      <span className="line-clamp-2">{r.title}</span>
                      <span className="mt-0.5 block text-[11px] text-brand-muted">{dayLabel(r.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {counts.size > 0 && (
            <div className="rounded-2xl border border-brand-border bg-white p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-muted">Categories</h2>
              <ul className="space-y-2 text-sm">
                {[...counts.entries()].map(([c, n]) => (
                  <li key={c}>
                    <Link href={`/blog?category=${encodeURIComponent(c)}`} className="flex items-center justify-between hover:text-brand">
                      <span>{c}</span>
                      <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] text-brand-muted">{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
