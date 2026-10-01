"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logoutAdmin } from "@/app/admin/login/actions";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  also?: string[];
  master?: boolean; // visible to the master admin only
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/properties", label: "Properties" },
  { href: "/admin/properties/new", label: "Add Property" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/localities", label: "Locations" },
  // Master admin only:
  // One sourcing area: overview, link sources, bulk import, history and duplicates are tabs inside it.
  { href: "/admin/engine", label: "Data Engine", also: ["/admin/feeds", "/admin/properties/import"], master: true },
  { href: "/admin/home", label: "Home Page", master: true },
  { href: "/admin/pages", label: "Pages (About, Policies, FAQ)", master: true },
  { href: "/admin/media", label: "Media Library", master: true },
  { href: "/admin/leads", label: "Leads", master: true },
  { href: "/admin/users", label: "Registered Users", master: true },
  { href: "/admin/payments", label: "Payments", master: true },
  { href: "/admin/ai", label: "AI Admin", master: true },
  { href: "/admin/api", label: "API", master: true },
  { href: "/admin/admins", label: "Admin Team", master: true },
  { href: "/admin/settings", label: "Settings", master: true },
];

export default function AdminSidebar({ isMaster }: { isMaster: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => isMaster || !i.master);

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    if (item.also?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
    if (item.href === "/admin/properties" || item.href === "/admin/properties/new") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <aside className="w-full lg:w-60 shrink-0 bg-brand text-white flex flex-col lg:sticky lg:top-0 lg:h-screen">
      <div className="p-5 border-b border-white/10 flex items-center justify-between lg:block">
        <div>
          <Image src="/brand/logo.png" alt="BankAuction.co" width={140} height={55} className="h-8 w-auto brightness-0 invert" />
          <div className="text-[11px] text-white/50 mt-1 flex items-center gap-2">
            Admin Console
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${isMaster ? "bg-gold text-white" : "bg-white/15 text-white/80"}`}>
              {isMaster ? "Master" : "Admin"}
            </span>
          </div>
        </div>
        <Link href="/" target="_blank" className="text-xs text-white/60 hover:text-white lg:mt-3 lg:inline-block">
          View site ↗
        </Link>
      </div>
      <nav className="flex lg:flex-col gap-1 p-3 text-sm overflow-x-auto lg:overflow-y-auto lg:flex-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap px-3 py-2 rounded-lg transition-colors ${
              isActive(item) ? "bg-gold text-white font-medium" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {isMaster && (
        <Link href="/admin/engine" className="m-3 rounded-xl bg-white/5 p-3 block hover:bg-white/10">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Data engine</div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Auto sync every 30 min</div>
        </Link>
      )}
      <form action={logoutAdmin} className="p-3 border-t border-white/10">
        <button className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/60 hover:bg-white/8 hover:text-white">↪ Sign out</button>
      </form>
    </aside>
  );
}
