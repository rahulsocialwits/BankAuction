"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const QUICK_TYPES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

const QUICK_CITIES = ["Mumbai", "Delhi", "Surat", "Pune", "Ahmedabad", "Bangalore"];

export default function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

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
          placeholder="Search by city, bank, or property title..."
          className={`flex-1 outline-none px-4 ${size === "lg" ? "py-3.5 text-base" : "py-2 text-sm"}`}
        />
        <button type="submit" className={`bg-brand text-white font-medium hover:bg-brand-dark ${size === "lg" ? "px-6 py-3.5" : "px-4 py-2 text-sm"}`}>
          Search
        </button>
      </form>

      {open && (
        <div className="absolute z-20 top-full mt-2 left-0 right-0 bg-white border border-brand-border rounded-xl shadow-lg p-4">
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
          <div className="flex flex-wrap gap-2">
            {QUICK_CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={() => go({ q: c })}
                className="text-xs px-3 py-1.5 rounded-full border border-brand-border hover:border-brand hover:text-brand"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
