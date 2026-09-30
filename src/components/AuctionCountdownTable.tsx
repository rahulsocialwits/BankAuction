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

export default function AuctionCountdownTable({ rows }: { rows: CountdownRow[] }) {
  const [tab, setTab] = useState(0);
  const filtered = rows.filter((r) => TABS[tab].match(r.category)).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTab(i)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${i === tab ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Property</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Location</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-muted">No {TABS[tab].label.toLowerCase()} auctions right now.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-brand-border">
                <td className="px-4 py-3">
                  <Link href={`/property/${r.slug}`} className="font-medium hover:text-brand">{r.title}</Link>
                </td>
                <td className="px-4 py-3 text-brand-muted">{r.bankName ?? "—"}</td>
                <td className="px-4 py-3 text-brand-muted">{r.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
