"use client";

import { useEffect, useState } from "react";
import ScrollRow from "./ScrollRow";

/**
 * "Quick Navigation": a sticky list on desktop that highlights the section being read, and a swipeable row of
 * chips on a phone. Both jump to the section.
 */
export default function PolicyNav({ items }: { items: { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-110px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <>
      {/* phone / tablet */}
      <div className="lg:hidden min-w-0">
        <ScrollRow tone="page">
          {items.map((i) => (
            <a
              key={i.id}
              href={`#${i.id}`}
              onClick={go(i.id)}
              className={`snap-start shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs ${active === i.id ? "border-gold bg-gold text-white" : "border-brand-border bg-white text-black/70"}`}
            >
              {i.title}
            </a>
          ))}
        </ScrollRow>
      </div>

      {/* desktop */}
      <nav aria-label="Quick navigation" className="hidden lg:block sticky top-28 bg-white border border-brand-border rounded-2xl p-5">
        <div className="text-sm font-semibold text-brand mb-3">Quick Navigation</div>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                onClick={go(i.id)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${active === i.id ? "bg-gold text-white font-medium" : "text-black/70 hover:bg-brand-bg"}`}
              >
                {i.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
