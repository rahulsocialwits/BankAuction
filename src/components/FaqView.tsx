"use client";

import { useMemo, useState } from "react";
import RichText from "./RichText";
import ScrollRow from "./ScrollRow";
import type { FaqContent } from "@/lib/pages/content";

/**
 * FAQ: a hero band, a search box, category tabs and an accordion. Searching looks through every category;
 * clearing the box returns to the chosen tab.
 */
export default function FaqView({ content }: { content: FaqContent }) {
  const [tab, setTab] = useState(content.categories[0]?.id ?? "");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const shown = useMemo(() => {
    if (query) {
      return content.categories.flatMap((c) =>
        c.items.filter((it) => `${it.q} ${it.a}`.toLowerCase().includes(query)).map((it) => ({ ...it, cat: c.name })),
      );
    }
    return (content.categories.find((c) => c.id === tab)?.items ?? []).map((it) => ({ ...it, cat: "" }));
  }, [content, tab, query]);

  return (
    <main>
      <section className="bg-gradient-to-br from-brand via-brand to-[#1d3358] text-white">
        <div className="w-full px-5 lg:px-10 xl:px-16 py-12 md:py-14">
          <h1 className="text-3xl md:text-4xl font-bold">{content.heroTitle}</h1>
          {content.heroSubtitle && <p className="mt-3 max-w-2xl text-white/80 text-sm md:text-base">{content.heroSubtitle}</p>}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1100px] px-5 lg:px-10 py-8 md:py-10">
        <div className="flex flex-col-reverse gap-5 md:flex-row md:items-end md:justify-between">
          <div className={`min-w-0 md:flex-1 ${query ? "opacity-40 pointer-events-none" : ""}`}>
            <ScrollRow tone="page">
              {content.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={!query && tab === c.id}
                  onClick={() => setTab(c.id)}
                  className={`snap-start shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${!query && tab === c.id ? "border-brand font-semibold text-brand" : "border-transparent text-black/60 hover:text-brand"}`}
                >
                  {c.name}
                </button>
              ))}
            </ScrollRow>
          </div>
          <label className="relative md:w-72">
            <span className="sr-only">Search the questions</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Looking for something?"
              className="w-full border-0 border-b-2 border-brand/40 bg-transparent px-1 py-2 pr-8 text-sm focus:border-brand focus:outline-none"
            />
            <svg className="absolute right-1 top-1/2 -translate-y-1/2 text-brand" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </label>
        </div>

        <div className="mt-4 border-t border-brand-border">
          {shown.length === 0 && <p className="py-10 text-center text-sm text-brand-muted">No question matches &ldquo;{q}&rdquo;. Try different words, or <a href="/contact" className="text-brand underline">ask us directly</a>.</p>}
          {shown.map((it, i) => (
            <details key={`${it.q}-${i}`} className="group border-b border-brand-border">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  {it.cat && <span className="block text-[11px] font-medium uppercase tracking-wide text-brand-muted mb-0.5">{it.cat}</span>}
                  <span className="text-[15px] font-semibold text-brand">{it.q}</span>
                </span>
                <svg className="mt-1 shrink-0 text-brand transition-transform group-open:rotate-180" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              <div className="pb-6 pr-8"><RichText text={it.a} /></div>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-brand-muted">
          Still have a question? <a href="/contact" className="font-medium text-brand hover:underline">Contact us</a>.
        </p>
      </div>
    </main>
  );
}
