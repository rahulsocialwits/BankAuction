"use client";

import { useState } from "react";

export interface OrderItem {
  value: string; // city name, or property-type code
  label: string;
  thumb: string | null; // picture already uploaded for this tile
}

const arrow = "flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-white text-sm hover:bg-brand-bg disabled:opacity-30";

/**
 * Arrange tiles: position 1 is the first tile on the home page. Arrows move a tile up or down; a mini map of the
 * 4-column layout shows where every position lands. Posts hidden inputs `${prefix}_0`, `${prefix}_1`, …
 * in the chosen order, so the normal Save button stores it.
 */
export default function OrderEditor({
  prefix,
  initial,
  columns,
  nameEditable,
  max,
  addLabel,
  options,
}: {
  prefix: string;
  initial: OrderItem[];
  columns: number;
  nameEditable: boolean;
  max: number;
  addLabel?: string;
  /** When given, a name is picked from this list instead of typed. */
  options?: { value: string; label: string }[];
}) {
  const [items, setItems] = useState(initial);

  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const where = (i: number) => `Row ${Math.floor(i / columns) + 1}, column ${(i % columns) + 1}`;

  return (
    <div>
      {items.map((it, i) => (
        <input key={`h${i}`} type="hidden" name={`${prefix}_${i}`} value={it.value} />
      ))}

      {/* mini map of the layout */}
      <div className="mb-4 inline-grid gap-1.5 rounded-xl border border-brand-border bg-white p-3" style={{ gridTemplateColumns: `repeat(${columns}, 3.2rem)` }} aria-hidden="true">
        {items.map((it, i) => (
          <div key={i} className="flex h-9 items-center justify-center overflow-hidden rounded-md bg-brand-bg text-[10px] font-semibold text-brand">
            {i + 1}
          </div>
        ))}
      </div>

      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={`${it.value}-${i}`} className="flex items-center gap-3 rounded-xl border border-brand-border bg-white p-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
            <div className="flex h-12 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-bg text-[10px] text-brand-muted">
              {it.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                "No picture"
              )}
            </div>
            <div className="min-w-0 flex-1">
              {nameEditable && options ? (
                <select
                  value={it.value}
                  onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value, label: options.find((op) => op.value === e.target.value)?.label ?? "" } : x)))}
                  aria-label={`Position ${i + 1} bank`}
                  className="w-full rounded-lg border border-brand-border bg-white px-3 py-1.5 text-sm font-medium"
                >
                  <option value="">Choose…</option>
                  {options.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
              ) : nameEditable ? (
                <input
                  value={it.label}
                  onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value, label: e.target.value } : x)))}
                  placeholder="City name"
                  aria-label={`Position ${i + 1} name`}
                  className="w-full rounded-lg border border-brand-border px-3 py-1.5 text-sm font-medium"
                />
              ) : (
                <div className="text-sm font-medium">{it.label}</div>
              )}
              <div className="mt-0.5 text-[11px] text-brand-muted">Position {i + 1} · {where(i)}</div>
            </div>
            <button type="button" className={arrow} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${it.label || "tile"} earlier`}>↑</button>
            <button type="button" className={arrow} disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${it.label || "tile"} later`}>↓</button>
            {nameEditable && (
              <button type="button" className={`${arrow} text-red-600`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
            )}
          </li>
        ))}
      </ol>

      {nameEditable && items.length < max && (
        <button type="button" onClick={() => setItems((l) => [...l, { value: "", label: "", thumb: null }])} className="mt-3 rounded-lg border border-brand-border bg-white px-4 py-2 text-sm hover:bg-brand-bg">
          {addLabel ?? "+ Add"} ({items.length}/{max})
        </button>
      )}
    </div>
  );
}
