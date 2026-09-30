"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const QUICK_TYPES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

const FALLBACK: Record<string, string[]> = {
  Mumbai: ["Ghatkopar", "Kurla", "Dadar", "Bhandup", "Borivali", "Andheri"],
  Delhi: ["Dwarka", "Rohini", "Saket"],
  Pune: ["Kothrud", "Hinjewadi", "Viman Nagar"],
  Bangalore: ["Whitefield", "Koramangala", "Electronic City"],
  Ahmedabad: ["Satellite", "Navrangpura", "Bopal"],
  Surat: ["Adajan", "Vesu", "Katargam"],
};

let cache: Record<string, string[]> | null = null;

export default function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [localities, setLocalities] = useState<Record<string, string[]>>(cache ?? FALLBACK);

  useEffect(() => {
    if (!open || cache) return;
    fetch("/api/localities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          cache = data;
          setLocalities(data);
        }
      })
      .catch(() => {});
  }, [open]);

  const cities = Object.keys(localities);
  const query = q.trim().toLowerCase();

  const matchedLocalities = query
    ? Object.entries(localities)
        .flatMap(([city, list]) => list.filter((l) => l.toLowerCase().includes(query)).map((l) => ({ city, locality: l })))
        .slice(0, 6)
    : [];
  const matchedCities = query ? cities.filter((c) => c.toLowerCase().includes(query)).slice(0, 4) : [];

  function go(params: Record<string, string>) {
    const usp = new URLSearchParams(params);
    router.push(`/properties?${usp.toString()}`);
    setOpen(false);
  }

  return (
    <div className="relative w-full text-left">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q ? { q } : {});
        }}
        className="flex items-center bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search city, locality (Kurla, Ghatkopar...), bank or title"
          aria-label="Search auction properties"
          className={`flex-1 min-w-0 outline-none px-4 text-black ${size === "lg" ? "py-3.5 text-base" : "py-2 text-sm"}`}
        />
        <button type="submit" className={`bg-brand text-white font-medium hover:bg-brand-dark ${size === "lg" ? "px-6 py-3.5" : "px-4 py-2 text-sm"}`}>
          Search
        </button>
      </form>

      {open && (
        <div className="absolute z-30 top-full mt-2 left-0 right-0 bg-white text-black border border-brand-border rounded-xl shadow-xl p-4 max-h-96 overflow-y-auto">
          {query && (matchedCities.length > 0 || matchedLocalities.length > 0) && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-brand-muted mb-2">Suggestions</div>
              <div className="flex flex-col">
                {matchedCities.map((c) => (
                  <button key={c} type="button" onMouseDown={() => go({ city: c })} className="text-left text-sm px-2 py-1.5 rounded hover:bg-brand-bg">
                    <span className="font-medium">{c}</span> <span className="text-xs text-brand-muted">· City</span>
                  </button>
                ))}
                {matchedLocalities.map((m) => (
                  <button
                    key={`${m.city}-${m.locality}`}
                    type="button"
                    onMouseDown={() => go({ city: m.city, locality: m.locality })}
                    className="text-left text-sm px-2 py-1.5 rounded hover:bg-brand-bg"
                  >
                    <span className="font-medium">{m.locality}</span> <span className="text-xs text-brand-muted">· {m.city}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs font-semibold text-brand-muted mb-2">Property types</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onMouseDown={() => go({ category: t.value })}
                className="text-xs px-3 py-1.5 rounded-full border border-brand-border hover:border-brand hover:text-brand"
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-brand-muted mb-2">Browse by city</div>
          <div className="flex flex-wrap gap-2 mb-1">
            {cities.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setExpandedCity((prev) => (prev === c ? null : c));
                }}
                className={`text-xs px-3 py-1.5 rounded-full border ${expandedCity === c ? "bg-brand text-white border-brand" : "border-brand-border hover:border-brand hover:text-brand"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {expandedCity && (
            <div className="mt-3 pl-3 border-l-2 border-gold">
              <div className="text-xs font-semibold text-brand-muted mb-2">Areas in {expandedCity}</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {(localities[expandedCity] ?? []).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onMouseDown={() => go({ city: expandedCity, locality: loc })}
                    className="text-xs px-3 py-1 rounded-full bg-brand-bg hover:bg-brand-border"
                  >
                    {loc}
                  </button>
                ))}
              </div>
              <button type="button" onMouseDown={() => go({ city: expandedCity })} className="text-xs text-brand font-medium hover:underline">
                View all in {expandedCity} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
