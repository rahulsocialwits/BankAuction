"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A horizontally scrollable row that is obvious to use: swipe on a phone, arrow buttons on a computer, and a soft
 * fade on whichever edge still has more to scroll to.
 */
export default function ScrollRow({ children, className = "", tone = "white" }: { children: React.ReactNode; className?: string; tone?: "white" | "page" }) {
  // The edge fade must match the background behind the row, or it shows up as a pale patch.
  const fadeL = tone === "page" ? "from-brand-bg via-brand-bg/80" : "from-white via-white/80";
  const fadeR = tone === "page" ? "from-brand-bg via-brand-bg/80" : "from-white via-white/80";
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(200, (ref.current?.clientWidth ?? 400) * 0.7), behavior: "smooth" });

  const arrow = "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white border border-brand-border shadow-md text-brand hover:bg-brand hover:text-white transition-colors";

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div ref={ref} className="flex gap-2 overflow-x-auto snap-x scroll-smooth px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {canLeft && (
        <>
          <div className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r ${fadeL} to-transparent`} />
          <button type="button" aria-label="Scroll left" onClick={() => scrollBy(-1)} className={`${arrow} left-0`}>‹</button>
        </>
      )}
      {canRight && (
        <>
          <div className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l ${fadeR} to-transparent`} />
          <button type="button" aria-label="Scroll right" onClick={() => scrollBy(1)} className={`${arrow} right-0`}>›</button>
        </>
      )}
    </div>
  );
}
