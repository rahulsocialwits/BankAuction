"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const QUICK_TYPES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
];

let cache: Record<string, string[]> | null = null;

type Item = { key: string; label: string; hint: string; params: Record<string, string> };

/**
 * Search box with live suggestions. Typing lists matching cities and areas; picking one (click, or arrow keys
 * + Enter) opens that place straight away; plain Enter searches the typed words. With an empty box it offers
 * popular cities and property types, one click each.
 */
export default function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [localities, setLocalities] = useState<Record<string, string[]>>(cache ?? {});
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetch("/api/localities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !cancelled) {
          cache = data;
          setLocalities(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const query = q.trim().toLowerCase();
  const cities = Object.keys(localities);

  const suggestions: Item[] = useMemo(() => {
    if (!query) return [];
    const out: Item[] = [];
    for (const c of cities) {
      if (c.toLowerCase().includes(query)) out.push({ key: `c-${c}`, label: c, hint: "City", params: { city: c, status: "all" } });
    }
    for (const [city, list] of Object.entries(localities)) {
      for (const l of list) {
        if (l.toLowerCase().includes(query)) out.push({ key: `a-${city}-${l}`, label: l, hint: `Area · ${city}`, params: { city, locality: l, status: "all" } });
      }
    }
    // cities that start with the text first, then the rest
    out.sort((a, b) => Number(b.label.toLowerCase().startsWith(query)) - Number(a.label.toLowerCase().startsWith(query)));
    return out.slice(0, 8);
  }, [query, cities, localities]);

  function go(params: Record<string, string>) {
    router.push(`/properties?${new URLSearchParams(params).toString()}`);
    setOpen(false);
    setActive(-1);
  }

  function submit() {
    if (active >= 0 && suggestions[active]) return go(suggestions[active].params);
    go(q.trim() ? { q: q.trim(), status: "all" } : {});
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const lg = size === "lg";
  const popular = cities.slice(0, 12);

  return (
    <div ref={boxRef} className="relative w-full text-left">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={lg ? "Search city, area (Kurla, Mira Road), bank or title" : "Search city, area, bank..."}
          aria-label="Search auction properties"
          aria-autocomplete="list"
          autoComplete="off"
          className={`flex-1 min-w-0 outline-none px-4 text-black ${lg ? "py-3.5 text-base" : "py-2 text-sm"}`}
        />
        {q && (
          <button type="button" aria-label="Clear" onClick={() => { setQ(""); setActive(-1); }} className="px-2 text-brand-muted hover:text-black">
            ✕
          </button>
        )}
        <button type="submit" className={`bg-brand text-white font-medium hover:bg-brand-dark ${lg ? "px-6 py-3.5" : "px-4 py-2 text-sm"}`}>
          Search
        </button>
      </form>

      {open && (
        <div className="absolute z-30 top-full mt-2 left-0 right-0 bg-white text-black border border-brand-border rounded-xl shadow-xl p-3 max-h-96 overflow-y-auto">
          {query ? (
            <>
              <button
                type="button"
                onClick={() => go({ q: q.trim(), status: "all" })}
                className="w-full text-left text-sm px-2 py-2 rounded hover:bg-brand-bg"
              >
                Search properties for <span className="font-semibold">“{q.trim()}”</span>
              </button>
              {suggestions.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(s.params)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left text-sm px-2 py-2 rounded flex items-center justify-between gap-3 ${i === active ? "bg-brand-bg" : "hover:bg-brand-bg"}`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-brand-muted">{s.hint}</span>
                </button>
              ))}
              {suggestions.length === 0 && <div className="text-xs text-brand-muted px-2 py-2">No matching city or area — press Search to look through titles and addresses.</div>}
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-brand-muted px-2 mb-2">Popular cities</div>
              <div className="flex flex-wrap gap-2 mb-4 px-1">
                {popular.length === 0 && <span className="text-xs text-brand-muted px-1">Loading…</span>}
                {popular.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => go({ city: c, status: "all" })}
                    className="text-xs px-3 py-1.5 rounded-full border border-brand-border hover:border-brand hover:bg-brand hover:text-white transition-colors"
                  >
                    {c}
                  </button>
                ))}
                <a href="/cities" className="text-xs px-3 py-1.5 rounded-full text-brand font-medium hover:underline">All cities →</a>
              </div>
              <div className="text-xs font-semibold text-brand-muted px-2 mb-2">Property types</div>
              <div className="flex flex-wrap gap-2 px-1">
                {QUICK_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => go({ category: t.value, status: "all" })}
                    className="text-xs px-3 py-1.5 rounded-full border border-brand-border hover:border-brand hover:bg-brand hover:text-white transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
