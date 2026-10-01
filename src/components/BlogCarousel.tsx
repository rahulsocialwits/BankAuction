import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import DragScroll from "./DragScroll";
import { dayLabel } from "@/lib/seo";

/** Four latest posts: 4 across on desktop, a swipeable row showing two cards at a time on a phone. */
export default async function BlogCarousel() {
  const posts = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  if (posts.length === 0) {
    return (
      <p className="text-brand-muted text-sm py-6 text-center border border-dashed border-brand-border rounded-xl">
        New auction insights coming soon.
      </p>
    );
  }

  return (
    <DragScroll className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-5 px-5 scroll-px-5 md:scroll-px-0 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {posts.map((p) => (
        <Link key={p.id} href={`/blog/${p.slug}`} className="group snap-start shrink-0 w-[68%] sm:w-[44%] md:w-auto flex flex-col bg-white border border-brand-border rounded-xl overflow-hidden hover:border-brand hover:shadow-md transition">
          <div className="relative aspect-[400/270] bg-gradient-to-br from-brand to-brand-dark">
            {p.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {p.category && <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-white">{p.category}</span>}
          </div>
          <div className="flex flex-1 flex-col p-3 sm:p-4">
            <div className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-brand">{p.title}</div>
            {p.excerpt && <p className="mt-1.5 text-xs text-brand-muted line-clamp-3">{p.excerpt}</p>}
            <div className="mt-auto pt-3 text-[11px] text-brand-muted">{dayLabel(p.createdAt)}</div>
          </div>
        </Link>
      ))}
    </DragScroll>
  );
}
