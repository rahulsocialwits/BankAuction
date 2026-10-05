"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the server data of the page every `seconds` while it is visible. The page itself is NOT reloaded: forms, scroll and results stay. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
