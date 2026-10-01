"use client";

import Link from "next/link";
import { useState } from "react";
import { PropertyCategory } from "@prisma/client";

export interface CountdownRow {
  id: string;
  slug: string;
  title: string;
  bankName: string | null;
  location: string | null;
  category: PropertyCategory | null;
  auctionStart: string | null; // ISO string (kept for callers; not shown)
}

const TABS: { label: string; match: (c: PropertyCategory | null) => boolean }[] = [
  { label: "Residential", match: (c) => c === "RESIDENTIAL" },
  { label: "Commercial", match: (c) => c === "COMMERCIAL" },
  { label: "Industrial", match: (c) => c === "INDUSTRIAL" },
  { label: "Agricultural", match: (c) => c === "AGRICULTURAL" },
  { label: "Other", match: (c) => c === null || c === "LAND_PLOT" },
];

export default function AuctionCountdownTable({ rows, viewAllHref = "/properties" }: { rows: CountdownRow[]; viewAllHref?: string }) {
  const [tab, setTab] = useState(0);
  const filtered = rows.filter((r) => TABS[tab].match(r.category)).slice(0, 8);

  return (
    <div>
      {/* Tabs: a row of folder-style tabs sitting on the card, active one in the brand blue. */}
      <div className="flex items-end justify-between gap-3 border-b border-brand-border">
        <div role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`whitespace-nowrap px-5 py-2.5 text-sm rounded-t-xl border border-b-0 -mb-px transition-colors ${
                i === tab ? "bg-white border-brand-border text-brand font-semibold border-t-2 border-t-brand" : "bg-brand-bg border-transparent text-brand-muted hover:text-brand"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link href={viewAllHref} className="shrink-0 pb-2.5 text-sm font-medium text-brand hover:underline">View all Auctions ›</Link>
      </div>

      <div className="bg-white border border-t-0 border-brand-border rounded-b-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-brand text-white text-left text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 first:rounded-tl-none">Property Name</th>
              <th className="px-5 py-3">Bank</th>
              <th className="px-5 py-3">Location</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-brand-muted">No {TABS[tab].label.toLowerCase()} auctions right now.</td></tr>
            )}
            {filtered.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-brand-bg/60" : "bg-white"}>
                <td className="px-5 py-3.5 max-w-md">
                  <Link href={`/property/${r.slug}`} className="font-medium hover:text-brand line-clamp-2">{r.title}</Link>
                </td>
                <td className="px-5 py-3.5 text-black/80">{r.bankName ?? "—"}</td>
                <td className="px-5 py-3.5 text-black/80">{r.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
