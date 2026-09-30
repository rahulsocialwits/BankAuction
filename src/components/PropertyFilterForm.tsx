"use client";

import { useState } from "react";

interface Props {
  localities: Record<string, string[]>;
  banks: { id: string; name: string }[];
  categories: { label: string; value: string }[];
  initial: {
    q?: string;
    city?: string;
    locality?: string;
    category?: string;
    bank?: string;
    status?: string;
    priceMin?: string;
    priceMax?: string;
  };
}

const field = "w-full border border-brand-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand";
const label = "block text-[11px] font-semibold text-brand-muted mb-1 uppercase tracking-wide";

export default function PropertyFilterForm({ localities, banks, categories, initial }: Props) {
  const [city, setCity] = useState(initial.city ?? "");
  const cities = Object.keys(localities);
  const areas = city ? (localities[city] ?? []) : [];

  return (
    <form action="/properties" className="bg-white border border-brand-border rounded-2xl p-4 sm:p-5 mb-6 shadow-sm">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={label}>Keyword</label>
          <input type="text" name="q" defaultValue={initial.q} placeholder="Title, address, keyword..." className={field} />
        </div>
        <div>
          <label className={label}>City</label>
          <select name="city" value={city} onChange={(e) => setCity(e.target.value)} className={field}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Area / Locality</label>
          <select
            key={city}
            name="locality"
            defaultValue={city === initial.city ? initial.locality ?? "" : ""}
            disabled={!city}
            className={`${field} disabled:bg-brand-bg disabled:text-brand-muted`}
          >
            <option value="">{city ? `All areas in ${city}` : "Select a city first"}</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Property type</label>
          <select name="category" defaultValue={initial.category ?? ""} className={field}>
            <option value="">All types</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Bank</label>
          <select name="bank" defaultValue={initial.bank ?? ""} className={field}>
            <option value="">All banks</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Auction status</label>
          <select name="status" defaultValue={initial.status ?? "active"} className={field}>
            <option value="active">Live &amp; Upcoming</option>
            <option value="completed">Completed / Past</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
      <div className="flex items-center gap-3 mt-4">
        <button type="submit" className="bg-brand text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-brand-dark">
          Search properties
        </button>
        <a href="/properties" className="text-sm text-brand-muted hover:text-brand">Reset</a>
      </div>
    </form>
  );
}
