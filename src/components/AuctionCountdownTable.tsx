"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PropertyCategory } from "@prisma/client";

export interface CountdownRow {
  id: string;
  slug: string;
  title: string;
  bankName: string | null;
  location: string | null;
  category: PropertyCategory | null;
  auctionStart: string | null; // ISO string
}

const TABS: { label: string; match: (c: PropertyCategory | null) => boolean }[] = [
  { label: "Residential", match: (c) => c === "RESIDENTIAL" },
  { label: "Commercial", match: (c) => c === "COMMERCIAL" },
  { label: "Industrial", match: (c) => c === "INDUSTRIAL" },
  { label: "Agricultural", match: (c) => c === "AGRICULTURAL" },
  { label: "Other", match: (c) => c === null || c === "LAND_PLOT" || c === "VEHICLE" },
];

function useCountdown(target: string | null) {
  // Start null so server and client render the same "—" on first paint;
  // the real clock only kicks in after mount, avoiding a hydration mismatch
  // from SSR time vs. client time differing by seconds/minutes.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!target || now === null) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, mins: 0 };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, mins };
}

function Row({ row }: { row: CountdownRow }) {
  const cd = useCountdown(row.auctionStart);
  return (
    <tr className="border-t border-brand-border">
      <td className="px-4 py-3">
        <Link href={`/property/${row.slug}`} className="font-medium hover:text-brand">{row.title}</Link>
      </td>
      <td className="px-4 py-3 text-brand-muted">{row.bankName ?? "—"}</td>
      <td className="px-4 py-3 text-brand-muted">{row.location ?? "—"}</td>
      <td className="px-4 py-3">
        {cd ? (
          <span className="text-xs font-medium">
            {cd.days}d {cd.hours}h {cd.mins}m
          </span>
        ) : (
          <span className="text-xs text-brand-muted">—</span>
        )}
      </td>
    </tr>
  );
}

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
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Property</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Location</th>
              <th className="px-4 py-2.5">Auction Starts In</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-muted">No {TABS[tab].label.toLowerCase()} auctions right now.</td></tr>
            )}
            {filtered.map((r) => <Row key={r.id} row={r} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
