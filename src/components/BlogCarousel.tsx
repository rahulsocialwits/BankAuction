import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export default async function BlogCarousel() {
  const posts = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  if (posts.length === 0) {
    return (
      <p className="text-brand-muted text-sm py-6 text-center border border-dashed border-brand-border rounded-xl">
        New auction insights coming soon.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
      {posts.map((p) => (
        <Link
          key={p.id}
          href={`/blog/${p.slug}`}
          className="snap-start shrink-0 w-64 bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors"
        >
          <div className="font-semibold text-sm mb-1 line-clamp-2">{p.title}</div>
          {p.excerpt && <p className="text-xs text-brand-muted line-clamp-3">{p.excerpt}</p>}
        </Link>
      ))}
    </div>
  );
}
