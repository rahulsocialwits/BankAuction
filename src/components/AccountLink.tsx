"use client";

import Link from "next/link";
import { useMe } from "@/lib/auth/useMe";

export default function AccountLink({ logoutAction }: { logoutAction: () => void }) {
  const { loaded, user } = useMe();

  if (!loaded) return <span className="hidden md:block ml-auto w-24 h-8" aria-hidden />;

  return user ? (
    <div className="hidden md:flex items-center gap-3 ml-auto text-xs">
      <span className="font-semibold">Hi, {user.name?.split(" ")[0] ?? "there"}</span>
      <form action={logoutAction}>
        <button className="text-brand-muted hover:text-brand">Sign out</button>
      </form>
    </div>
  ) : (
    <Link href="/login" className="hidden md:flex items-center gap-2 text-xs font-semibold text-brand border border-brand-border px-3 py-2 rounded-lg ml-auto xl:ml-0">
      Account
    </Link>
  );
}
