import Link from "next/link";
import RichText from "./RichText";
import PolicyNav from "./PolicyNav";
import type { PolicyContent } from "@/lib/pages/content";

const OTHERS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-and-conditions", label: "Terms and Conditions" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/faq", label: "FAQ" },
];

function ShieldIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** Privacy / Terms / Disclaimer: a hero band, a "Quick Navigation" column and the sections as one readable card. */
export default function PolicyView({ content, path }: { content: PolicyContent; path: string }) {
  return (
    <main>
      <section className="bg-gradient-to-br from-brand via-brand to-[#1d3358] text-white">
        <div className="w-full px-5 lg:px-10 xl:px-16 py-12 md:py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20"><ShieldIcon /></div>
          <h1 className="text-3xl md:text-4xl font-bold">{content.heroTitle}</h1>
          {content.heroSubtitle && <p className="mx-auto mt-4 max-w-2xl text-white/80 text-sm md:text-base">{content.heroSubtitle}</p>}
          {content.lastUpdated && <p className="mt-5 text-xs text-white/60">Last updated: {content.lastUpdated}</p>}
        </div>
      </section>

      <div className="w-full px-5 lg:px-10 xl:px-16 py-8 md:py-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
        <PolicyNav items={content.sections.map((s) => ({ id: s.id, title: s.title }))} />

        <article className="bg-white border border-brand-border rounded-2xl p-6 sm:p-9 min-w-0">
          {content.sections.map((s, i) => (
            <section key={s.id} id={s.id} className={`scroll-mt-28 ${i > 0 ? "mt-9 pt-9 border-t border-brand-border" : ""}`}>
              <h2 className="flex items-center gap-3 text-lg sm:text-xl font-semibold text-brand mb-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-dark"><DocIcon /></span>
                {s.title}
              </h2>
              <RichText text={s.body} />
            </section>
          ))}

          <div className="mt-10 pt-6 border-t border-brand-border flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-brand-muted">Also read:</span>
            {OTHERS.filter((o) => o.href !== path).map((o) => (
              <Link key={o.href} href={o.href} className="text-brand font-medium hover:underline">{o.label}</Link>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
