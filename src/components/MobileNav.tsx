"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";
import { useMe } from "@/lib/auth/useMe";

export default function MobileNav({
  navItems,
  logoutAction,
}: {
  navItems: { href: string; label: string }[];
  logoutAction: () => void;
}) {
  const isLoggedIn = !!useMe().user;
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden ml-auto flex items-center gap-2">
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-border"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-[89px] bottom-0 bg-white z-40 overflow-y-auto px-5 py-5">
          {pathname !== "/" && (
            <div className="mb-5">
              <SearchBar />
            </div>
          )}
          <nav className="flex flex-col gap-1 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2.5 border-b border-brand-border"
              >
                {item.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <form action={logoutAction}>
                <button type="submit" className="py-2.5 text-left w-full">Sign out</button>
              </form>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className="py-2.5">
                Account / Login
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
