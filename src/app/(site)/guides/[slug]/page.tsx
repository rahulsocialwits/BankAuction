import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return { title: "Guide not found", robots: { index: false } };
  return { title: g.title, description: g.description, alternates: { canonical: `/guides/${g.slug}` }, openGraph: { title: g.title, description: g.description } };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12 max-w-3xl mx-auto">
      <Link href="/guides" className="text-sm text-brand hover:underline">← All guides</Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-brand mt-3 mb-2">{g.title}</h1>
      <p className="text-brand-muted text-sm mb-8">{g.description}</p>
      {g.sections.map((s) => (
        <section key={s.heading} className="mb-7">
          <h2 className="text-lg font-semibold text-brand mb-2">{s.heading}</h2>
          {s.body.map((p, i) => <p key={i} className="text-sm leading-relaxed text-black/80 mb-3">{p}</p>)}
        </section>
      ))}
      <p className="rounded-xl border border-brand-border bg-[#F8FAFC] p-4 text-xs text-brand-muted">
        This guide is general information, not legal, financial or tax advice. Rules and terms differ by bank, state and auction. Read the official notice and take professional advice before you bid.
      </p>
      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/properties?status=active" className="text-brand font-semibold hover:underline">Browse active auctions →</Link>
        <Link href="/faq" className="text-brand hover:underline">FAQ</Link>
      </div>
    </main>
  );
}
