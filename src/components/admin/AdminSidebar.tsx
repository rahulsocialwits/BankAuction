import Link from "next/link";
import Image from "next/image";
import { logoutAdmin } from "@/app/admin/login/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/properties", label: "Properties" },
  { href: "/admin/sources", label: "Sources" },
];

export default function AdminSidebar() {
  return (
    <aside className="w-56 shrink-0 bg-brand min-h-screen text-white flex flex-col">
      <div className="p-5 border-b border-white/10">
        <Image src="/brand/logo.png" alt="BankAuction.co" width={140} height={55} className="h-8 w-auto brightness-0 invert" />
        <div className="text-[11px] text-white/50 mt-1">Admin</div>
      </div>
      <nav className="flex-1 p-3 space-y-1 text-sm">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="block px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors">
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={logoutAdmin} className="p-3 border-t border-white/10">
        <button type="submit" className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors">
          Sign out
        </button>
      </form>
    </aside>
  );
}
