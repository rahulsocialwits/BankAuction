"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ScrollRow from "./ScrollRow";

export interface CityEntry {
  city: string;
  slug: string;
  count: number;
}
export interface StateGroup {
  state: string;
  total: number;
  cities: CityEntry[];
}

/** Every city, grouped by state and searchable, so a long list stays easy to scan. */
export default function CityDirectory({ groups }: { groups: StateGroup[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        cities: g.state.toLowerCase().includes(query) ? g.cities : g.cities.filter((c) => c.city.toLowerCase().includes(query)),
      }))
      .filter((g) => g.cities.length > 0);
  }, [groups, query]);

  return (
    <div>
      {/* Search on top; the state chips below it form one swipeable row (arrows on desktop). */}
      <div className="mb-6 pb-4 border-b border-brand-border">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a state or city…"
          aria-label="Search a state or city"
          className="w-full sm:max-w-md border border-brand-border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <div className="mt-3 flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-brand-muted">States</span>
          <ScrollRow className="flex-1" tone="page">
            {groups.map((g) => (
              <a
                key={g.state}
                href={`#state-${g.state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="snap-start shrink-0 whitespace-nowrap text-xs px-3.5 py-2 rounded-full border border-brand-border bg-white hover:border-brand hover:text-brand active:bg-brand-bg"
              >
                {g.state} <span className="text-brand-muted">{g.total}</span>
              </a>
            ))}
          </ScrollRow>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-brand-muted py-10 text-center">No state or city matches &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="space-y-8">
          {shown.map((g) => (
            <section key={g.state} id={`state-${g.state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="scroll-mt-28">
              <div className="flex items-baseline gap-3 mb-3 border-b border-brand-border pb-2">
                <h2 className="font-semibold text-brand">{g.state}</h2>
                <span className="text-xs text-brand-muted">{g.total} listing{g.total === 1 ? "" : "s"}</span>
                {g.state !== "Other" && (
                  <Link href={`/properties?state=${encodeURIComponent(g.state)}&status=all`} className="ml-auto text-xs text-brand font-medium hover:underline">
                    All in {g.state} →
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-2">
                {g.cities.map((c) => (
                  <Link key={c.slug} href={`/city/${c.slug}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-brand-bg">
                    <span className="leading-tight break-words min-w-0 text-[13px] sm:text-sm">{c.city}</span>
                    <span className="text-xs text-brand-muted shrink-0">{c.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
