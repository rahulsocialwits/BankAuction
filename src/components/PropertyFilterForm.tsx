"use client";

import { useState } from "react";
import Dropdown from "./Dropdown";
import type { PlaceData } from "@/lib/queries/places";

interface Props {
  localities: Record<string, string[]>;
  places: PlaceData;
  banks: { id: string; name: string }[];
  categories: { label: string; value: string }[];
  initial: {
    q?: string;
    state?: string;
    city?: string;
    locality?: string;
    category?: string;
    bank?: string;
    status?: string;
    priceMin?: string;
    priceMax?: string;
    view?: string;
  };
}

const field = "w-full border border-brand-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand";
const label = "block text-[11px] font-semibold text-brand-muted mb-1 uppercase tracking-wide";

export default function PropertyFilterForm({ localities, places, banks, categories, initial }: Props) {
  const [state, setState] = useState(initial.state ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [locality, setLocality] = useState(initial.locality ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [bank, setBank] = useState(initial.bank ?? "");
  const [status, setStatus] = useState(initial.status ?? "active");
  const activeCount = [initial.q, initial.state, initial.city, initial.locality, initial.category, initial.bank, initial.priceMin, initial.priceMax].filter(Boolean).length;
  const [open, setOpen] = useState(activeCount > 0);
  // Choosing a state narrows the city list to that state's cities.
  const cities = state ? places.cities.filter((c) => c.state?.toLowerCase() === state.toLowerCase()).map((c) => c.city) : Object.keys(localities);
  const areas = city ? (localities[city] ?? []) : [];

  return (
    <form action="/properties" className="bg-white border border-brand-border rounded-2xl p-4 sm:p-5 mb-6 shadow-sm">
      {initial.view === "map" && <input type="hidden" name="view" value="map" />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="md:hidden w-full flex items-center justify-between gap-3 py-1 text-sm font-semibold text-brand"
      >
        <span>Filters{activeCount ? ` (${activeCount})` : ""}</span>
        <span className="flex items-center gap-2 text-xs font-medium text-brand-muted">
          {open ? "Hide" : "Show"}
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-brand-bg text-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </span>
      </button>
      <div className={`${open ? "grid mt-4" : "hidden"} md:mt-0 md:grid grid-cols-2 lg:grid-cols-4 gap-3`}>
        <div className="col-span-2">
          <label className={label}>Keyword</label>
          <input type="text" name="q" defaultValue={initial.q} placeholder="Title, address, keyword..." className={field} />
        </div>
        <div>
          <label className={label}>State</label>
          <Dropdown
            name="state"
            value={state}
            onChange={(v) => { setState(v); setCity(""); setLocality(""); }}
            options={places.states.map((s) => ({ value: s.name, label: s.name }))}
            placeholder="All states"
            searchable
            className={field}
          />
        </div>
        <div>
          <label className={label}>City</label>
          <Dropdown
            name="city"
            value={city}
            onChange={(v) => { setCity(v); setLocality(""); }}
            options={cities.map((c) => ({ value: c, label: c }))}
            placeholder="All cities"
            searchable
            className={field}
          />
        </div>
        <div>
          <label className={label}>Area / Locality</label>
          <Dropdown
            name="locality"
            value={locality}
            onChange={setLocality}
            options={areas.map((a) => ({ value: a, label: a }))}
            placeholder={city ? `All areas in ${city}` : "Select a city first"}
            disabled={!city}
            searchable
            className={field}
          />
        </div>
        <div>
          <label className={label}>Property type</label>
          <Dropdown
            name="category"
            value={category}
            onChange={setCategory}
            options={categories}
            placeholder="All types"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Bank</label>
          <Dropdown
            name="bank"
            value={bank}
            onChange={setBank}
            options={banks.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="All banks"
            searchable
            className={field}
          />
        </div>
        <div>
          <label className={label}>Auction status</label>
          <input type="hidden" name="status" value={status} />
          <Dropdown
            name="statusUi"
            value={status}
            onChange={(v) => setStatus(v || "active")}
            options={[
              { value: "active", label: "Live & Upcoming" },
              { value: "completed", label: "Completed / Past" },
              { value: "all", label: "All" },
            ]}
            placeholder="Live & Upcoming"
            className={field}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Min ₹</label>
            <input type="number" name="priceMin" defaultValue={initial.priceMin} placeholder="0" className={field} />
          </div>
          <div>
            <label className={label}>Max ₹</label>
            <input type="number" name="priceMax" defaultValue={initial.priceMax} placeholder="Any" className={field} />
          </div>
        </div>
      </div>
      <div className={`${open ? "flex" : "hidden"} md:flex items-center gap-3 mt-4`}>
        <button type="submit" className="flex-1 md:flex-none bg-brand text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-brand-dark">
          Search properties
        </button>
        <a href="/properties" className="text-sm text-brand-muted hover:text-brand">Reset</a>
      </div>
    </form>
  );
}
