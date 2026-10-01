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
      {/* Tabs scroll sideways on a phone; "View all" has its own spot so nothing is squeezed. */}
      <div className="flex items-end justify-between gap-3 border-b border-brand-border">
        <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 text-sm rounded-t-xl border border-b-0 -mb-px transition-colors ${
                i === tab ? "bg-white border-brand-border text-brand font-semibold border-t-2 border-t-brand" : "bg-brand-bg border-transparent text-brand-muted hover:text-brand"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link href={viewAllHref} className="hidden sm:block shrink-0 pb-2.5 text-sm font-medium text-brand hover:underline">View all Auctions ›</Link>
      </div>

      <div className="bg-white border border-t-0 border-brand-border rounded-b-xl overflow-hidden">
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-brand-muted">No {TABS[tab].label.toLowerCase()} auctions right now.</p>}

        {/* One table on every screen size; on a phone Location folds under the title so nothing scrolls sideways. */}
        {filtered.length > 0 && (
          <table className="w-full table-fixed text-sm">
            <colgroup><col className="w-[58%] sm:w-[46%]" /><col className="w-[42%] sm:w-[26%]" /><col className="hidden sm:table-column sm:w-[24%]" /><col className="hidden sm:table-column sm:w-[4%]" /></colgroup>
            <thead>
              <tr className="bg-brand text-white text-left text-xs font-semibold uppercase tracking-wide">
                <th className="px-4 sm:px-5 py-3">Property Name</th>
                <th className="px-3 sm:px-4 py-3">Bank</th>
                <th className="hidden sm:table-cell px-4 py-3">Location</th>
                <th className="hidden sm:table-cell py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className={`group border-t border-brand-border/60 transition-colors hover:bg-brand-bg ${i % 2 ? "bg-brand-bg/50" : "bg-white"}`}>
                  <td className="px-4 sm:px-5 py-3.5 align-middle">
                    <Link href={`/property/${r.slug}`} className="font-medium leading-snug group-hover:text-brand line-clamp-2">{r.title}</Link>
                    <span className="sm:hidden mt-1 block text-xs text-brand-muted truncate">{r.location ?? "—"}</span>
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 align-middle text-black/80 text-[13px] sm:text-sm"><span className="line-clamp-3 sm:line-clamp-2">{r.bankName ?? "—"}</span></td>
                  <td className="hidden sm:table-cell px-4 py-3.5 align-middle text-black/80"><span className="line-clamp-2">{r.location ?? "—"}</span></td>
                  <td className="hidden sm:table-cell pr-3 align-middle text-brand-muted group-hover:text-brand">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Link href={viewAllHref} className="sm:hidden block border-t border-brand-border bg-brand-bg py-3 text-center text-sm font-semibold text-brand">View all Auctions ›</Link>
      </div>
    </div>
  );
}
