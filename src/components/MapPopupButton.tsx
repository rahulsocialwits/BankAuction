"use client";

import { useEffect, useState } from "react";

/**
 * "View area on map": opens the map in a popup on the same page (no new tab). The map is the OpenStreetMap embed of the stored
 * coordinates. When the stored point is only the city centre the popup says so.
 */
export default function MapPopupButton({ lat, lng, title, approximate }: { lat: number; lng: number; title: string; approximate: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const d = approximate ? 0.12 : 0.01;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-gold underline">View area on map</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Map: ${title}`} onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
              <p className="text-sm font-semibold text-brand truncate">{title}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close map" className="h-8 w-8 shrink-0 rounded-full bg-[#EEF2F8] text-brand hover:bg-[#E0E7F1]">✕</button>
            </div>
            <iframe title={`Map of ${title}`} src={src} className="block w-full h-[60vh] min-h-[320px] border-0" loading="lazy" referrerPolicy="no-referrer" />
            <p className="px-4 py-2 text-[11px] text-brand-muted">
              {approximate ? "Approximate: the pin marks the city centre, not the exact address. The exact address is in the auction notice." : "Location from the source data."} Map © OpenStreetMap contributors.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
