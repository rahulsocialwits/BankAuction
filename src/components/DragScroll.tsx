"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A sideways row that always moves: finger swipe on a phone, click-and-drag with a mouse, and (optionally) arrow
 * buttons. The caller supplies the layout classes; a drag never counts as a click on a card inside.
 */
export default function DragScroll({ children, className = "", arrows = false }: { children: React.ReactNode; className?: string; arrows?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, moved: false, x: 0, left: 0 });
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

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, (ref.current?.clientWidth ?? 400) * 0.8), behavior: "smooth" });

  const arrow = "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-white border border-brand-border shadow-md text-brand text-xl hover:bg-brand hover:text-white transition-colors";

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        className={`${className} touch-pan-x`}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
          drag.current = { down: true, moved: false, x: e.clientX, left: ref.current.scrollLeft };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.down || !ref.current) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) > 5) {
            d.moved = true;
            ref.current.style.scrollSnapType = "none"; // snapping fights a manual drag
            ref.current.style.cursor = "grabbing";
          }
          if (d.moved) ref.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => {
          const el = ref.current;
          drag.current.down = false;
          if (el) {
            el.style.scrollSnapType = "";
            el.style.cursor = "";
          }
        }}
        onPointerLeave={() => {
          if (!drag.current.down) return;
          drag.current.down = false;
          if (ref.current) {
            ref.current.style.scrollSnapType = "";
            ref.current.style.cursor = "";
          }
        }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.current.moved = false;
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
      {arrows && canLeft && <button type="button" aria-label="Scroll left" onClick={() => scrollBy(-1)} className={`${arrow} left-1`}>‹</button>}
      {arrows && canRight && <button type="button" aria-label="Scroll right" onClick={() => scrollBy(1)} className={`${arrow} right-1`}>›</button>}
    </div>
  );
}
