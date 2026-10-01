"use client";

import { useEffect, useState } from "react";

interface Item {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

type Props =
  | { mode: "slot"; slotKey: string; action: (formData: FormData) => void | Promise<void>; label?: string }
  | { mode: "url"; inputName: string; label?: string };

/**
 * "Choose from library": opens a pop-up with every picture already uploaded to the Media Library.
 *  - slot mode: picking one puts it straight into that slot of the Home Page.
 *  - url mode: picking one fills a link box (used for logos and the site icon).
 */
export default function MediaPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || items) return;
    fetch("/api/media-list")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load the library"))))
      .then(setItems)
      .catch((e) => setErr(e.message));
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const shown = (items ?? []).filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()));

  function pickUrl(id: string) {
    if (props.mode !== "url") return;
    const input = document.querySelector<HTMLInputElement>(`input[name="${props.inputName}"]`);
    if (input) {
      input.value = `/api/media/${id}`;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">
        {props.label ?? "Choose from library"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Media library" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 border-b border-brand-border">
              <h3 className="font-semibold">Media Library</h3>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" className="border border-brand-border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs" autoFocus />
              <a href="/admin/media" className="text-xs text-brand hover:underline ml-auto">Upload new →</a>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-xl leading-none px-2 text-brand-muted hover:text-black">✕</button>
            </div>
            <div className="p-4 overflow-y-auto">
              {err && <div className="text-sm text-red-600">{err}</div>}
              {!items && !err && <div className="text-sm text-brand-muted">Loading…</div>}
              {items && shown.length === 0 && <div className="text-sm text-brand-muted py-8 text-center">{items.length === 0 ? "The library is empty. Upload pictures first." : "No picture matches that name."}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {shown.map((m) => {
                  const card = (
                    <>
                      <div className="aspect-[4/3] bg-[repeating-conic-gradient(#f1f3f7_0%_25%,#fff_0%_50%)] [background-size:14px_14px] flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/media/${m.id}?thumb=1`} alt={m.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="p-2 text-left">
                        <div className="text-xs font-medium truncate">{m.name}</div>
                        <div className="text-[10px] text-brand-muted">{m.width && m.height ? `${m.width} × ${m.height}` : ""} {(m.sizeBytes / 1024).toFixed(0)} KB</div>
                      </div>
                    </>
                  );
                  const cls = "block w-full border border-brand-border rounded-xl overflow-hidden hover:border-brand hover:shadow-md transition";
                  return props.mode === "slot" ? (
                    <form key={m.id} action={props.action}>
                      <input type="hidden" name="key" value={props.slotKey} />
                      <button type="submit" name="assetId" value={m.id} className={cls}>{card}</button>
                    </form>
                  ) : (
                    <button key={m.id} type="button" onClick={() => pickUrl(m.id)} className={cls}>{card}</button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
