"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth/useMe";

/** Heart button: saves / removes this property for the logged-in user. Logged out: it sends the person to sign in first. */
export default function SavePropertyButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { loaded, user } = useMe();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch(`/api/saved?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { saved?: boolean }) => { if (live) setSaved(!!d.saved); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [user, slug]);

  async function toggle() {
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    setBusy(true);
    try {
      const r = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      if (r.ok) setSaved(((await r.json()) as { saved: boolean }).saved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || !loaded}
      aria-pressed={saved}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${saved ? "border-gold bg-[#FFF8E6] text-brand" : "border-brand-border text-brand hover:bg-brand-bg"}`}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span> {saved ? "Saved" : "Save"}
    </button>
  );
}
