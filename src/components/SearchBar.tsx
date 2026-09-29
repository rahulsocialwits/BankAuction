"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const QUICK_TYPES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

const CITY_LOCALITIES: Record<string, string[]> = {
  Mumbai: ["Ghatkopar", "Kurla", "Borivali", "Andheri", "Thane"],
  Delhi: ["Dwarka", "Rohini", "Saket", "Karol Bagh"],
  Pune: ["Kothrud", "Hinjewadi", "Viman Nagar"],
  Bangalore: ["Whitefield", "Koramangala", "Electronic City"],
  Ahmedabad: ["Satellite", "Navrangpura", "Bopal"],
  Surat: ["Adajan", "Vesu", "Katargam"],
};

const QUICK_CITIES = Object.keys(CITY_LOCALITIES);

export default function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

  function go(params: Record<string, string>) {
    const usp = new URLSearchParams(params);
    router.push(`/properties?${usp.toString()}`);
    setOpen(false);
  }

  return (
    <div className="relative w-full">
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
          placeholder="Search by city, locality, bank, or property title..."
          className={`flex-1 outline-none px-4 ${size === "lg" ? "py-3.5 text-base" : "py-2 text-sm"}`}
        />
        <button type="submit" className={`bg-brand text-white font-medium hover:bg-brand-dark ${size === "lg" ? "px-6 py-3.5" : "px-4 py-2 text-sm"}`}>
          Search
        </button>
      </form>

      {open && (
        <div className="absolute z-20 top-full mt-2 left-0 right-0 bg-white border border-brand-border rounded-xl shadow-lg p-4 max-h-80 overflow-y-auto">
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
          <div className="text-xs font-semibold text-brand-muted mb-2">Popular cities</div>
          <div className="flex flex-wrap gap-2 mb-1">
            {QUICK_CITIES.map((c) => (
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
            <div className="mt-2 pl-2 border-l-2 border-brand-border">
              <div className="flex flex-wrap gap-2 mb-2">
                {CITY_LOCALITIES[expandedCity].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onMouseDown={() => go({ q: loc })}
                    className="text-xs px-3 py-1 rounded-full bg-brand-bg hover:bg-brand-border"
                  >
                    {loc}
                  </button>
                ))}
              </div>
              <button type="button" onMouseDown={() => go({ q: expandedCity })} className="text-xs text-brand font-medium hover:underline">
                View all in {expandedCity} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
