"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/auth/useMe";

interface Doc { id: string; title: string }
interface Open { id: string; title: string; url: string }

/** The documents list. Everyone sees the rows; a Premium member gets the real links (fetched after login is known, so the page stays cached). */
export default function PropertyDocuments({ slug, docs }: { slug: string; docs: Doc[] }) {
  const { user } = useMe();
  const [open, setOpen] = useState<Open[] | null>(null);
  const premium = !!user?.premium;

  useEffect(() => {
    if (!premium) return;
    let live = true;
    fetch(`/api/property-docs/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { documents?: Open[] } | null) => { if (live && d?.documents) setOpen(d.documents); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [premium, slug]);

  return (
    <ul className="text-sm divide-y divide-brand-border border border-brand-border rounded-xl overflow-hidden">
      {docs.map((d) => {
        const real = open?.find((o) => o.id === d.id);
        return (
          <li key={d.id} className="flex items-center justify-between px-4 py-2.5">
            <span>{d.title}</span>
            {real ? (
              <a href={real.url} target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">View Official Document →</a>
            ) : premium ? (
              <span className="text-xs text-brand-muted">Loading…</span>
            ) : (
              <Link href="/pricing" className="inline-flex items-center gap-2 group">
                <span className="blur-[4px] select-none text-brand font-medium group-hover:blur-[5px]">View Official Document</span>
                <span className="text-xs text-gold font-semibold whitespace-nowrap">Unlock →</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
