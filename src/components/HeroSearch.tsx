"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Dropdown from "./Dropdown";
import type { PlaceData } from "@/lib/queries/places";

type Chip = { kind: "state" | "city" | "area"; value: string; city?: string };

const TYPES = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "LAND_PLOT", label: "Land & Plot" },
  { value: "AGRICULTURAL", label: "Agricultural" },
];

const BUDGETS = [
  { value: "0-1000000", label: "Under ₹10 Lakh" },
  { value: "1000000-2500000", label: "₹10 – 25 Lakh" },
  { value: "2500000-5000000", label: "₹25 – 50 Lakh" },
  { value: "5000000-10000000", label: "₹50 Lakh – 1 Cr" },
  { value: "10000000-50000000", label: "₹1 – 5 Cr" },
  { value: "50000000-", label: "Above ₹5 Cr" },
];

let cache: PlaceData | null = null;

/**
 * Home-page search card: Location (state, then city, then area as chips), Property type, Budget, Explore.
 * Suggestions follow what is already chosen: a state narrows the cities, a city narrows the areas.
 */
export default function HeroSearch() {
  const router = useRouter();
  const [places, setPlaces] = useState<PlaceData | null>(cache);
  const [chips, setChips] = useState<Chip[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [budget, setBudget] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache) return;
    fetch("/api/places")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          cache = d;
          setPlaces(d);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const state = chips.find((c) => c.kind === "state")?.value;
  const city = chips.find((c) => c.kind === "city")?.value;
  const area = chips.find((c) => c.kind === "area");

  const suggestions = useMemo(() => {
    if (!places || area) return [];
    const q = text.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const out: { key: string; label: string; hint: string; chip: Chip }[] = [];
    if (!state && !city) {
      for (const s of places.states) if (match(s.name)) out.push({ key: `s-${s.name}`, label: s.name, hint: `State · ${s.count}`, chip: { kind: "state", value: s.name } });
    }
    if (!city) {
      for (const c of places.cities) {
        if (state && c.state?.toLowerCase() !== state.toLowerCase()) continue;
        if (match(c.city)) out.push({ key: `c-${c.city}`, label: c.city, hint: `City${c.state && !state ? " · " + c.state : ""}`, chip: { kind: "city", value: c.city } });
      }
    }
    if (q || city) {
      for (const a of places.areas) {
        if (city && a.city.toLowerCase() !== city.toLowerCase()) continue;
        if (q && match(a.area)) out.push({ key: `a-${a.city}-${a.area}`, label: a.area, hint: `Area · ${a.city}`, chip: { kind: "area", value: a.area, city: a.city } });
        else if (city && !q) out.push({ key: `a-${a.city}-${a.area}`, label: a.area, hint: "Area", chip: { kind: "area", value: a.area, city: a.city } });
      }
    }
    return out.slice(0, q ? 9 : 12);
  }, [places, text, state, city, area]);

  function pick(chip: Chip) {
    setChips((cs) => {
      // Picking a city or area by name also fixes the levels above it.
      const next = cs.filter((c) => c.kind !== chip.kind);
      if (chip.kind === "city") {
        const st = places?.cities.find((c) => c.city === chip.value)?.state;
        if (st && !next.some((c) => c.kind === "state")) next.unshift({ kind: "state", value: st });
      }
      if (chip.kind === "area" && chip.city && !next.some((c) => c.kind === "city")) {
        next.push({ kind: "city", value: chip.city });
        const st = places?.cities.find((c) => c.city === chip.city)?.state;
        if (st && !next.some((c) => c.kind === "state")) next.unshift({ kind: "state", value: st });
      }
      const order = { state: 0, city: 1, area: 2 } as const;
      return [...next, chip].sort((a, b) => order[a.kind] - order[b.kind]).filter((c, i, arr) => arr.findIndex((x) => x.kind === c.kind) === i);
    });
    setText("");
    setOpen(true);
  }

  function removeChip(kind: Chip["kind"]) {
    const order = { state: 0, city: 1, area: 2 } as const;
    // removing a level also removes the levels below it
    setChips((cs) => cs.filter((c) => order[c.kind] < order[kind]));
  }

  function explore(e?: React.FormEvent) {
    e?.preventDefault();
    const p = new URLSearchParams({ status: "all" });
    if (state) p.set("state", state);
    if (city) p.set("city", city);
    if (area) p.set("locality", area.value);
    if (text.trim() && !suggestions.length) p.set("q", text.trim());
    else if (text.trim() && suggestions[0] && chips.length === 0) {
      // typed a place name and pressed Explore: use the best match
      const s = suggestions[0].chip;
      if (s.kind === "state") p.set("state", s.value);
      if (s.kind === "city") p.set("city", s.value);
      if (s.kind === "area") {
        p.set("locality", s.value);
        if (s.city) p.set("city", s.city);
      }
    } else if (text.trim()) p.set("q", text.trim());
    if (type) p.set("category", type);
    if (budget) {
      const [min, max] = budget.split("-");
      if (min && min !== "0") p.set("priceMin", min);
      if (max) p.set("priceMax", max);
    }
    router.push(`/properties?${p.toString()}`);
  }

  const placeholder = chips.length === 0 ? "State, city or area" : !city ? "Add a city…" : !area ? "Add an area…" : "";

  return (
    <form onSubmit={explore} className="bg-white rounded-2xl shadow-xl p-2 grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-stretch text-left text-black">
      <div ref={boxRef} className="relative">
        <div
          className="flex flex-wrap items-center gap-1.5 min-h-[52px] px-3 py-1.5 rounded-xl border border-brand-border md:border-0 md:border-r md:rounded-none"
          onClick={() => setOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gold shrink-0" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {chips.map((c) => (
            <span key={c.kind} className="inline-flex items-center gap-1 rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium">
              {c.value}
              <button type="button" aria-label={`Remove ${c.value}`} onClick={(e) => { e.stopPropagation(); removeChip(c.kind); }} className="text-brand-muted hover:text-black">✕</button>
            </span>
          ))}
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !text && chips.length) removeChip(chips[chips.length - 1].kind);
              if (e.key === "Enter" && open && text.trim() && suggestions[0]) {
                e.preventDefault();
                pick(suggestions[0].chip);
              }
            }}
            placeholder={placeholder}
            aria-label="Location"
            autoComplete="off"
            className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-1.5"
          />
        </div>

        {open && suggestions.length > 0 && (
          <div className="absolute z-30 left-0 right-0 top-full mt-2 bg-white border border-brand-border rounded-xl shadow-xl max-h-72 overflow-y-auto py-1">
            {suggestions.map((s) => (
              <button key={s.key} type="button" onClick={() => pick(s.chip)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-brand-bg">
                <span className="font-medium">{s.label}</span>
                <span className="text-xs text-brand-muted">{s.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-1">
        <Dropdown name="category" value={type} onChange={setType} options={TYPES} placeholder="Property Type" className="w-full px-3 py-3.5 text-sm bg-white md:border-0 md:border-r md:rounded-none rounded-xl border border-brand-border" />
      </div>
      <div className="px-1">
        <Dropdown name="budget" value={budget} onChange={setBudget} options={BUDGETS} placeholder="Budget" className="w-full px-3 py-3.5 text-sm bg-white md:border-0 rounded-xl border border-brand-border md:rounded-none" />
      </div>
      <button type="submit" className="bg-gold hover:bg-gold-dark text-white font-semibold rounded-xl px-8 py-3.5 text-sm">
        Explore
      </button>
    </form>
  );
}
