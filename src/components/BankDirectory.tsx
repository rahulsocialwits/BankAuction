"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ScrollRow from "./ScrollRow";

export interface BankEntry {
  id: string;
  name: string;
  slug: string;
  count: number;
}

/** "ANDHRA PRADESH GRAMEENA BANK" -> "Andhra Pradesh Grameena Bank" (only when the source shouted it in capitals). */
const pretty = (n: string) => (n === n.toUpperCase() && /[A-Z]{3,}/.test(n) ? n.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : n);
// Short names people actually type, mapped to the words in the bank's full name.
const ALIASES: Record<string, string> = { sbi: "state bank of india", pnb: "punjab national", boi: "bank of india", bob: "bank of baroda", cbi: "central bank of india", ubi: "union bank", iob: "indian overseas", uco: "uco bank", bom: "bank of maharashtra", lic: "lic housing", hdfc: "hdfc", icici: "icici", idbi: "idbi", kotak: "kotak" };
const letterOf = (n: string) => (n.trim()[0] ?? "#").toUpperCase().replace(/[^A-Z]/, "#");

/** Search, A–Z jump and sort for a long list of banks. */
export default function BankDirectory({ banks }: { banks: BankEntry[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"az" | "count">("az");
  const [letter, setLetter] = useState("");
  const query = q.trim().toLowerCase();
  const expanded = ALIASES[query];

  const items = useMemo(() => banks.map((b) => ({ ...b, label: pretty(b.name) })), [banks]);
  const letters = useMemo(() => [...new Set(items.map((b) => letterOf(b.label)))].sort(), [items]);

  const shown = useMemo(() => {
    let list = items.filter((b) => (!query || b.label.toLowerCase().includes(query) || (!!expanded && b.label.toLowerCase().includes(expanded))) && (!letter || letterOf(b.label) === letter));
    list = [...list].sort((a, b) => (sort === "count" ? b.count - a.count || a.label.localeCompare(b.label) : a.label.localeCompare(b.label)));
    return list;
  }, [items, query, letter, sort]);

  const grouped = sort === "az" && !query && !letter;
  const groups = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const b of shown) m.set(letterOf(b.label), [...(m.get(letterOf(b.label)) ?? []), b]);
    return [...m.entries()];
  }, [shown]);

  const Card = ({ b }: { b: (typeof items)[number] }) => (
    <Link href={`/bank/${b.slug}`} className="group flex items-center gap-3 bg-white border border-brand-border rounded-xl p-3.5 hover:border-brand hover:shadow-md transition">
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">{letterOf(b.label)}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-black/90 group-hover:text-brand line-clamp-2">{b.label}</span>
        <span className="block text-xs text-brand-muted mt-0.5">{b.count} listing{b.count === 1 ? "" : "s"}</span>
      </span>
    </Link>
  );

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <label className="relative flex-1 sm:max-w-md">
            <span className="sr-only">Search banks</span>
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a bank, e.g. SBI, Canara, Bajaj…"
              className="w-full rounded-xl border border-brand-border bg-white py-3 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-black">✕</button>
            )}
          </label>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-brand-muted">Sort</span>
            {([["az", "A – Z"], ["count", "Most listings"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSort(v)} className={`rounded-full border px-3.5 py-2 ${sort === v ? "border-brand bg-brand text-white" : "border-brand-border bg-white hover:border-brand"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-brand-muted">Jump to</span>
          <ScrollRow className="flex-1" tone="page">
            <button type="button" onClick={() => setLetter("")} className={`snap-start shrink-0 rounded-full border px-3 py-1.5 text-xs ${letter === "" ? "border-brand bg-brand text-white" : "border-brand-border bg-white"}`}>All</button>
            {letters.map((l) => (
              <button key={l} type="button" onClick={() => setLetter(letter === l ? "" : l)} className={`snap-start shrink-0 h-8 w-8 rounded-full border text-xs font-medium ${letter === l ? "border-brand bg-brand text-white" : "border-brand-border bg-white hover:border-brand"}`}>{l}</button>
            ))}
          </ScrollRow>
        </div>
      </div>

      <p className="mb-4 text-xs text-brand-muted" role="status">
        {query || letter ? `${shown.length} of ${items.length} banks` : `${items.length} banks`}
        {query && <> matching &ldquo;{q}&rdquo;</>}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border bg-white py-14 text-center text-sm text-brand-muted">
          No bank matches &ldquo;{q}&rdquo;. <button type="button" className="text-brand underline" onClick={() => { setQ(""); setLetter(""); }}>Show all banks</button>
        </div>
      ) : grouped ? (
        <div className="space-y-8">
          {groups.map(([l, list]) => (
            <section key={l}>
              <h2 className="mb-3 flex items-center gap-3 text-sm font-semibold text-brand"><span className="text-lg">{l}</span><span className="h-px flex-1 bg-brand-border" /></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{list.map((b) => <Card key={b.id} b={b} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{shown.map((b) => <Card key={b.id} b={b} />)}</div>
      )}
    </div>
  );
}
