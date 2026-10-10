"use client";

import { useState } from "react";
import SafeImage from "./SafeImage";

/**
 * Photo gallery of one property: a large picture, previous / next buttons and a row of thumbnails. The photos are the bank's own
 * files (their URLs are stored, nothing is copied). With no photo at all it shows the placeholder picture.
 */
export default function PropertyGallery({ photos, title }: { photos: string[]; title: string }) {
  const list = photos.length ? photos : [null];
  const [i, setI] = useState(0);
  const go = (d: number) => setI((n) => (n + d + list.length) % list.length);
  return (
    <div className="mb-6">
      <div className="relative h-56 sm:h-80 rounded-2xl overflow-hidden bg-[#E8EDF5]">
        <SafeImage key={list[i] ?? "none"} src={list[i]} alt={`${title} — photo ${i + 1}`} loading="eager" className={`absolute inset-0 w-full h-full ${photos.length ? "object-contain" : "object-contain p-6"}`} />
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 text-brand shadow hover:bg-white">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 text-brand shadow hover:bg-white">›</button>
            <span className="absolute bottom-2 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-white">{i + 1} / {list.length}</span>
          </>
        )}
      </div>
      {list.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Photos">
          {list.map((src, n) => (
            <button key={(src ?? "") + n} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${n === i ? "border-gold" : "border-transparent opacity-80 hover:opacity-100"}`}>
              <SafeImage src={src} alt={`Photo ${n + 1}`} className="absolute inset-0 h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {photos.length > 0 && <p className="mt-1.5 text-[11px] text-brand-muted">Photos are published by the bank / auction portal.</p>}
    </div>
  );
}
