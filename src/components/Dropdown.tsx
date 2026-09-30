"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  name: string;
  options: Option[];
  value: string;
  onChange?: (value: string) => void;
  placeholder: string; // label for the empty value ("All cities")
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}

/** Custom select that always opens downward (native selects flip upward near the viewport bottom). */
export default function Dropdown({ name, options, value, onChange, placeholder, disabled, searchable, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const current = options.find((o) => o.value === value);

  function pick(v: string) {
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:bg-brand-bg disabled:text-brand-muted`}
      >
        <span className={`truncate ${current ? "" : "text-slate-500"}`}>{current ? current.label : placeholder}</span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-brand-border rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full px-3 py-2 text-sm border-b border-brand-border focus:outline-none"
            />
          )}
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1 text-sm">
            <li>
              <button type="button" onClick={() => pick("")} className={`w-full text-left px-3 py-2 hover:bg-brand-bg ${value === "" ? "font-semibold text-brand" : ""}`}>
                {placeholder}
              </button>
            </li>
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`w-full text-left px-3 py-2 hover:bg-brand-bg ${o.value === value ? "font-semibold text-brand" : ""}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-brand-muted">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
