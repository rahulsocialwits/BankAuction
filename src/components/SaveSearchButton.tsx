"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMe } from "@/lib/auth/useMe";

const KEYS = ["q", "keyword", "category", "bank", "state", "city", "locality", "status", "priceMin", "priceMax"];

/** "Save this search": keeps the current filters in My alerts. Needs a login. */
export default function SaveSearchButton({ label }: { label: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useMe();
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");

  const filters: Record<string, string> = {};
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) filters[k === "keyword" ? "q" : k] = v;
  }
  if (Object.keys(filters).length === 0) return null; // nothing to save on the plain list

  async function save() {
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    setState("busy");
    const r = await fetch("/api/saved-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: label, filters }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
  }

  return (
    <button type="button" onClick={save} disabled={state === "busy" || state === "saved"} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-bg disabled:opacity-70">
      {state === "saved" ? "Search saved ✓" : state === "error" ? "Could not save, try again" : state === "busy" ? "Saving…" : "Save this search"}
    </button>
  );
}
