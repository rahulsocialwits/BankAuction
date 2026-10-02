"use client";

import { useActionState, useState } from "react";
import { runScrapDemo, type DemoState } from "./actions";
import type { DemoRecord, DemoResult } from "@/lib/scrapDemo/types";

const field = "w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-semibold";

const inr = (n: number | null) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-700",
  FAILED: "bg-orange-100 text-orange-800",
};

const STEP_ICON = { done: "✓", skipped: "–", failed: "✕", refused: "⛔" } as const;
const STEP_COLOR = { done: "bg-green-600", skipped: "bg-gray-400", failed: "bg-orange-500", refused: "bg-red-600" } as const;

function Pipeline({ r }: { r: DemoResult }) {
  return (
    <ol className="space-y-2">
      {r.steps.map((s) => (
        <li key={s.state} className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${STEP_COLOR[s.outcome]}`}>{STEP_ICON[s.outcome]}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {s.state} <span className="font-normal text-brand-muted">· {s.ms} ms</span>
            </div>
            {s.note && <div className="break-words text-xs text-brand-muted">{s.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-border bg-white px-4 py-3">
      <div className="text-xl font-bold text-brand">{v}</div>
      <div className="text-xs text-brand-muted">{k}</div>
    </div>
  );
}

function RecordCard({ r }: { r: DemoRecord }) {
  const tone = r.extractionStatus === "REJECTED" ? "border-red-300 bg-red-50/40" : r.extractionStatus === "INCOMPLETE" ? "border-amber-300" : "border-brand-border";
  const badge = r.extractionStatus === "REJECTED" ? "bg-red-100 text-red-700" : r.extractionStatus === "INCOMPLETE" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800";
  const rows: [string, React.ReactNode][] = [
    ["Property ID", r.demoId],
    ["Bank", r.bank ?? "—"],
    ["Type", r.type ?? "—"],
    ["Address", r.address ?? "—"],
    ["City / State / Pincode", [r.city, r.state, r.pincode].filter(Boolean).join(" · ") || "—"],
    ["Reserve price", inr(r.reservePrice)],
    ["EMD", inr(r.emd)],
    ["Auction date", r.auctionDate ?? "—"],
    ["Inspection date", r.inspectionDate ?? "—"],
    ["Source", r.source],
    ["Source URL", r.sourceUrl ?? "—"],
    ["External reference", r.externalRef ?? "—"],
  ];
  return (
    <article className={`rounded-xl border bg-white p-4 ${tone}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug">{r.title ?? "(no title)"}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge}`}>{r.extractionStatus}</span>
      </div>
      <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-brand-muted">{k}</dt>
            <dd className="break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {(r.duplicateOf || r.missing.length > 0 || r.rejectedReason) && (
        <ul className="mt-3 space-y-1 border-t border-brand-border pt-3 text-xs">
          {r.rejectedReason && <li className="text-red-700">⛔ {r.rejectedReason}</li>}
          {r.duplicateOf && <li className="text-amber-800">⚠ Possible duplicate of a live property: “{r.duplicateOf}”</li>}
          {r.missing.length > 0 && !r.rejectedReason && <li className="text-amber-800">⚠ Missing: {r.missing.join(", ")}</li>}
        </ul>
      )}
    </article>
  );
}

export default function DemoRunner() {
  const [state, action, pending] = useActionState<DemoState, FormData>(runScrapDemo, { result: null });
  const [type, setType] = useState<"sample" | "url" | "paste">("sample");
  const r = state.result;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* Source card */}
      <form action={action} className="space-y-4 rounded-xl border border-brand-border bg-white p-5">
        <h2 className="font-semibold">Add Demo Source</h2>
        <div>
          <label className={label} htmlFor="d-name">Source name</label>
          <input id="d-name" name="name" defaultValue="Demo source" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="d-type">Source type</label>
          <select id="d-type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={field}>
            <option value="sample">Built-in sample notice (fictional data)</option>
            <option value="paste">Pasted notice text</option>
            <option value="url">Public URL (only if automated access is permitted)</option>
          </select>
        </div>
        {type === "url" && (
          <div>
            <label className={label} htmlFor="d-url">Source URL</label>
            <input id="d-url" name="url" type="url" placeholder="https://…" className={field} />
            <p className="mt-1 text-[11px] text-brand-muted">Checked first: robots.txt, then one request. robots disallow, HTTP 401/403 and anti-bot or login walls stop the run as REFUSED; the real answer is shown. One page only, no redirects, no retries.</p>
          </div>
        )}
        {type === "paste" && (
          <div>
            <label className={label} htmlFor="d-paste">Notice text</label>
            <textarea id="d-paste" name="pasted" rows={8} placeholder="Paste a public auction notice here…" className={field} />
          </div>
        )}
        {type === "sample" && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="mock" className="mt-0.5" />
            <span>Mock extraction: show the sample result without calling the AI (otherwise the existing AI Admin extraction is used as it is).</span>
          </label>
        )}
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-lg bg-brand-bg px-3 py-2 text-xs">
          <dt className="text-brand-muted">Status</dt>
          <dd className="font-medium">{pending ? "RUNNING…" : r ? r.status : "Not run yet"}</dd>
          <dt className="text-brand-muted">Input method</dt>
          <dd className="font-medium">{type === "sample" ? "Sample" : type === "paste" ? "Paste" : "Permitted public URL"}</dd>
        </dl>
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? "Running demo…" : "Run Demo"}
        </button>
        <p className="text-[11px] text-brand-muted">DEMO MODE — no production data will be changed.</p>
      </form>

      {/* Results */}
      <div className="min-w-0 space-y-6">
        {!r && !pending && <div className="rounded-xl border border-dashed border-brand-border bg-white px-6 py-14 text-center text-sm text-brand-muted">Pick a source and press <strong>Run Demo</strong>. The steps and the extracted properties appear here.</div>}
        {pending && <div className="rounded-xl border border-brand-border bg-white px-6 py-14 text-center text-sm text-brand-muted">Collecting and extracting… this can take up to a minute when the AI is used.</div>}

        {r && !pending && (
          <>
            <section className="rounded-xl border border-brand-border bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">Run status</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-xs text-brand-muted">{(r.durationMs / 1000).toFixed(1)} s · DEMO MODE</span>
              </div>
              {r.reason && (
                <div role="alert" className={`mb-4 rounded-lg px-3 py-2 text-sm ${r.status === "REFUSED" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-800"}`}>
                  {r.reason}
                  {r.status === "REFUSED" && <div className="mt-1 text-xs">Permitted alternatives: the bank&apos;s own public notice, a PDF or CSV you supply, a Google Sheet, pasted text, or an authorised API/partner feed.</div>}
                </div>
              )}
              <Pipeline r={r} />
            </section>

            {r.source.type === "url" && (
              <section className="rounded-xl border border-brand-border bg-white p-5">
                <h2 className="mb-3 font-semibold">Access check</h2>
                <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-brand-muted">Host</dt>
                  <dd className="break-words font-medium">{r.access.host ?? "—"}</dd>
                  <dt className="text-brand-muted">Matched demo deny-list</dt>
                  <dd className="font-medium">{r.access.denyListMatch ? `Yes (${r.access.denyListMatch})` : "No (the demo deny-list is empty)"}</dd>
                  <dt className="text-brand-muted">Access check (robots.txt)</dt>
                  <dd className="font-medium">{r.access.robots ?? "not reached"}</dd>
                  <dt className="text-brand-muted">HTTP status</dt>
                  <dd className="font-medium">{r.access.httpStatus ?? "no page request made"}</dd>
                  <dt className="text-brand-muted">Collection status</dt>
                  <dd className="font-medium">{r.access.collection}</dd>
                  <dt className="text-brand-muted">Reason</dt>
                  <dd className="break-words font-medium">{r.reason ?? (r.access.collection === "COLLECTED" ? "HTTP 200: page collected" : "—")}</dd>
                </dl>
              </section>
            )}

            {r.status === "COMPLETED" && (
              <>
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat k="Raw items collected" v={r.collected.items} />
                  <Stat k="Properties extracted" v={r.counts.extracted} />
                  <Stat k="Ready (OK)" v={r.counts.ok} />
                  <Stat k="Missing fields" v={r.counts.incomplete} />
                  <Stat k="Rejected" v={r.counts.rejected} />
                  <Stat k="Duplicate warnings" v={r.counts.duplicates} />
                </section>
                <p className="text-xs text-brand-muted">
                  Extraction: <strong>{r.extraction.mode === "AI" ? "existing AI Admin / Relay extraction (called as it is, no changes)" : "MOCK sample response (AI not called)"}</strong>
                  {r.extraction.model && <> · model {r.extraction.model}</>}
                  {r.extraction.tokens ? <> · {r.extraction.tokens.toLocaleString("en-IN")} tokens</> : null}. External reference and inspection date are read from the text by simple patterns, because the existing extraction does not return them.
                </p>

                <section>
                  <h2 className="mb-3 font-semibold">Extracted properties (demo review)</h2>
                  {r.records.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-brand-border bg-white px-6 py-10 text-center text-sm text-brand-muted">No property listings were found in this source.</p>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {r.records.map((rec) => <RecordCard key={rec.demoId} r={rec} />)}
                    </div>
                  )}
                </section>

                <details className="rounded-xl border border-brand-border bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold">Raw collected data ({r.collected.chars.toLocaleString("en-IN")} characters · {r.collected.lines} lines · {r.collected.contentType})</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-brand-bg p-3 text-xs">{r.collected.preview}{r.collected.chars > 1200 ? "\n…" : ""}</pre>
                </details>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
