"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/saved-searches?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
        router.refresh();
        setBusy(false);
      }}
      className="text-xs text-brand-muted hover:text-red-700 disabled:opacity-60"
      aria-label="Delete this saved search"
    >
      Delete
    </button>
  );
}
