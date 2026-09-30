"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/engine", label: "Overview", exact: true },
  { href: "/admin/feeds", label: "Link Sources" },
  { href: "/admin/properties/import", label: "Bulk Import" },
  { href: "/admin/engine/history", label: "Run History" },
  { href: "/admin/engine/duplicates", label: "Duplicates" },
];

/** One sourcing area: every source-related page shows this tab bar so nothing is scattered across the sidebar. */
export default function EngineTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-brand-border mb-6">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              active ? "border-brand text-brand" : "border-transparent text-brand-muted hover:text-brand"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
