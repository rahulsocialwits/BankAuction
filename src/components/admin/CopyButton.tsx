"use client";

import { useState } from "react";

/** Copies a link (made absolute with this site's address) to the clipboard. */
export default function CopyButton({ path, label = "Copy link", className = "" }: { path: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    const url = path.startsWith("http") ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // older browsers / insecure context: fall back to a hidden textarea
      const t = document.createElement("textarea");
      t.value = url;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className={className || "text-[11px] border border-brand-border rounded px-2 py-1 hover:bg-brand-bg"}>
      {done ? "Copied ✓" : label}
    </button>
  );
}
