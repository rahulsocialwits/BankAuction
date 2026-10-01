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

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();
  const related = await prisma.blogPost.findMany({ where: { status: "PUBLISHED", id: { not: post.id } }, orderBy: { createdAt: "desc" }, take: 3 });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10 sm:py-14">
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
      <article className="max-w-3xl">
        <nav className="text-xs text-brand-muted mb-4">
          <Link href="/" className="hover:underline">Home</Link> / <Link href="/blog" className="hover:underline">Insights</Link>
        </nav>
        {post.category && (
          <Link href={`/blog?category=${encodeURIComponent(post.category)}`} className="inline-block rounded-full bg-gold px-3 py-1 text-xs font-semibold text-white mb-3">{post.category}</Link>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold leading-tight mb-2">{post.title}</h1>
        <div className="text-xs text-brand-muted mb-6">{dayLabel(post.createdAt)}</div>
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt="" className="w-full rounded-2xl mb-6 aspect-[16/9] object-cover" />
        )}
        <RichText text={post.body} className="text-sm sm:text-base leading-7 text-black/80" />
        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className="rounded-full border border-brand-border bg-white px-3 py-1 text-xs text-brand-muted hover:border-brand">#{t}</Link>
            ))}
          </div>
        )}
      </article>
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-brand mb-4">More insights</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {related.map((r) => (
              <Link key={r.id} href={`/blog/${r.slug}`} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors">
                <div className="text-sm font-semibold line-clamp-2">{r.title}</div>
                {r.excerpt && <p className="mt-1 text-xs text-brand-muted line-clamp-2">{r.excerpt}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
