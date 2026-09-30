"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export interface Me { name: string | null; email: string }

// Last known answer, used only to avoid a flicker between navigations.
let last: Me | null | undefined;
let inflight: Promise<Me | null> | null = null;

function load() {
  inflight ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .then((d: { user: Me | null }) => (last = d.user))
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

/** Client-side login state. Re-checked on every route change so login/logout show up immediately. */
export function useMe() {
  const pathname = usePathname();
  const [state, setState] = useState<{ loaded: boolean; user: Me | null }>({ loaded: last !== undefined, user: last ?? null });
  useEffect(() => {
    let live = true;
    load().then((user) => live && setState({ loaded: true, user }));
    return () => { live = false; };
  }, [pathname]);
  return state;
}
