import Link from "next/link";
import Image from "next/image";
import { logoutAdmin } from "@/app/admin/login/actions";

const NAV = [
  ["/admin","Dashboard","⌂"],
  ["/admin/properties","Properties","▦"],
  ["/admin/leads","Leads","♧"],
  ["/admin/sources","Sources","◈"],
  ["/admin/blog","Blog","✎"],
  ["/admin/settings","Settings","⚙"],
];

export default function AdminSidebar() {
  return (
    <aside className="w-[250px] shrink-0 bg-[#0d1b31] min-h-screen text-white flex flex-col sticky top-0 h-screen">
      <div className="p-5 border-b border-white/10">
        <Image src="/brand/logo.png" alt="BankAuction.co" width={160} height={60} className="h-9 w-auto brightness-0 invert" />
        <div className="mt-3 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/60">ADMIN CONTROL CENTER</div>
      </div>
      <nav className="flex-1 p-3 space-y-1.5">
        {NAV.map(([href,label,icon]) => (
          <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-white/65 hover:bg-white/8 hover:text-white transition-colors">
            <span className="w-8 h-8 rounded-lg bg-white/5 grid place-items-center text-sm group-hover:bg-[#c79a3b]/20 group-hover:text-[#e2bc6b]">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/5 p-3">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Data engine</div>
        <div className="mt-1 text-xs text-white/80">BankAuctions.in</div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Auto sync every 30 min</div>
      </div>
      <form action={logoutAdmin} className="p-3 border-t border-white/10">
        <button className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/60 hover:bg-white/8 hover:text-white">↪ Sign out</button>
      </form>
    </aside>
  );
}