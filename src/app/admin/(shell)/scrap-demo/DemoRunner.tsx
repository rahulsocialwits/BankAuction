"use client";

import { useActionState, useState } from "react";
import { addAsLiveSource, runScrapDemo, type DemoState } from "./actions";
import { GROUPS } from "@/lib/scrapDemo/fields";
import { DEFAULT_SETTINGS } from "@/lib/scrapDemo/settings";
import type { CandidateDiag, DemoResult, FieldValue } from "@/lib/scrapDemo/types";

const field = "w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-semibold";
const card = "rounded-xl border border-brand-border bg-white p-5";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-700",
  FAILED: "bg-orange-100 text-orange-800",
};
const STEP_ICON = { done: "✓", skipped: "–", failed: "✕", refused: "⛔" } as const;
const STEP_COLOR = { done: "bg-green-600", skipped: "bg-gray-400", failed: "bg-orange-500", refused: "bg-red-600" } as const;
const PAGE_STYLE: Record<string, string> = { COLLECTED: "bg-green-100 text-green-800", REFUSED: "bg-red-100 text-red-700", FAILED: "bg-orange-100 text-orange-800" };
const VERDICT_STYLE: Record<string, string> = { ACCEPTED: "bg-green-100 text-green-800", REJECTED: "bg-red-100 text-red-700", "NOT FETCHED": "bg-gray-100 text-gray-700" };

const kb = (n: number | null) => (n ? (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "—");
const n0 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-border bg-white px-4 py-3">
      <div className="text-xl font-bold text-brand">{v}</div>
      <div className="text-xs text-brand-muted">{k}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-brand-muted">{k}</dt>
      <dd className="min-w-0 break-words font-medium">{v}</dd>
    </>
  );
}

function Pipeline({ r }: { r: DemoResult }) {
  return (
    <ol className="space-y-2">
      {r.steps.map((s, i) => (
        <li key={s.state + i} className="flex items-start gap-3">
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

function Fields({ list }: { list: FieldValue[] }) {
  return (
    <ul className="divide-y divide-brand-border">
      {list.map((f) => (
        <li key={f.key} className="grid gap-x-4 gap-y-0.5 py-2 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <div className="text-brand-muted">{f.label}</div>
          {f.value ? (
            <div className="min-w-0">
              <div className="whitespace-pre-wrap break-words font-medium">{f.value}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-brand-muted">
                <span>source: {f.source ?? "—"}</span>
                {f.verified === true && <span className="text-green-700">✓ found in source</span>}
                {f.verified === false && <span className="text-amber-700">⚠ not found word-for-word</span>}
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-brand-muted">Missing from available source. (Not found in collected public sources.)</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, children, open = false }: { title: string; count?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl border border-brand-border bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm font-semibold">
        <span>{title}</span>
        {count && <span className="text-xs font-normal text-brand-muted">{count}</span>}
      </summary>
      <div className="border-t border-brand-border px-5 py-3">{children}</div>
    </details>
  );
}

function CandidateCard({ c }: { c: CandidateDiag }) {
  const d = c.diagnostics;
  return (
    <article className="rounded-xl border border-brand-border bg-white p-4 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[c.verdict]}`}>{c.verdict}</span>
        <span className="rounded-full bg-brand-bg px-2.5 py-0.5 text-[10px] font-semibold">{c.kind}</span>
        {c.score !== null && <span className="font-semibold">score {c.score} · {c.label}</span>}
      </div>
      <div className="break-all font-medium">{c.url}</div>
      <p className="mt-2 break-words text-brand-muted">{c.reason}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
        <Row k="HTTP status" v={c.httpStatus ?? "—"} />
        <Row k="Render mode" v={d ? d.renderMode : "FAILED / not fetched"} />
        <Row k="Page state" v={d ? d.pageState : c.verdict === "NOT FETCHED" ? "not fetched" : "REFUSED / FAILED"} />
        <Row k="HTML size" v={d ? `${n0(d.htmlChars)} chars` : "—"} />
        <Row k="Visible text (HTTP)" v={d ? `${n0(d.httpTextChars)} chars` : "—"} />
        <Row k="Visible text (rendered)" v={d ? (d.renderedTextChars === null ? "not rendered" : `${n0(d.renderedTextChars)} chars`) : "—"} />
        <Row k="Property signals" v={`${c.signalsFound} of ${c.signalsTotal}${c.signals.length ? ` — ${c.signals.join(", ")}` : ""}`} />
        <Row k="Detected title" v={c.title ?? "—"} />
        <Row k="Detected property / auction ID" v={c.propertyId ?? "—"} />
        <Row k="Detected reserve price" v={c.reserve ?? "—"} />
        <Row k="Detected auction date" v={c.auctionDate ?? "—"} />
      </dl>
      {d && (
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold text-brand">Full page diagnostics</summary>
          <dl className="mt-2 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
            <Row k="Final URL" v={d.finalUrl} />
            <Row k="Content-Type" v={d.contentType || "—"} />
            <Row k="Redirects" v={d.redirects} />
            <Row k="Title" v={d.title ?? "—"} />
            <Row k="H1" v={d.h1 ?? "—"} />
            <Row k="H2 count" v={d.h2Count} />
            <Row k="Scripts" v={d.scripts} />
            <Row k="Links" v={d.links} />
            <Row k="Images" v={d.images} />
            <Row k="JSON-LD blocks" v={d.jsonLdCount} />
            <Row k="Keywords" v={`property ${d.keywords.property} · auction ${d.keywords.auction} · bank ${d.keywords.bank} · reserve ${d.keywords.reserve} · EMD ${d.keywords.emd} · date ${d.keywords.date} · address ${d.keywords.address}`} />
            {d.shellWhy && <Row k="JS shell evidence" v={d.shellWhy} />}
          </dl>
        </details>
      )}
    </article>
  );
}

export default function DemoRunner() {
  const [state, action, pending] = useActionState<DemoState, FormData>(runScrapDemo, { result: null });
  const [type, setType] = useState<"sample" | "url" | "paste" | "diagnose">("sample");
  const r = state.result;
  const p = r?.property ?? null;
  const isWeb = type === "url" || type === "diagnose";
  const s = DEFAULT_SETTINGS;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      {/* Source card */}
      <form action={action} className="space-y-4 rounded-xl border border-brand-border bg-white p-5 xl:sticky xl:top-4">
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
            <option value="url">Public website: scan, pick ONE property, deep scan</option>
            <option value="diagnose">Public website: diagnose given page addresses</option>
          </select>
        </div>
        {type === "url" && (
          <div>
            <label className={label} htmlFor="d-url">Website URL</label>
            <input id="d-url" name="url" type="url" placeholder="https://…" className={field} />
            <p className="mt-1 text-[11px] text-brand-muted">
              Reads robots.txt and the public sitemap, crawls the same domain within the limits below, scores every page, selects ONE property and
              collects it in depth. robots disallow, HTTP 401/403, CAPTCHA, login or anti-bot walls stop that page as REFUSED.
            </p>
          </div>
        )}
        {type === "diagnose" && (
          <div>
            <label className={label} htmlFor="d-urls">Page addresses (one per line, same website)</label>
            <textarea id="d-urls" name="urls" rows={5} placeholder={"https://example.com/property-detail/123\nhttps://example.com/auction-detail/456"} className={field} />
            <p className="mt-1 text-[11px] text-brand-muted">Each address is fetched once, rendered in a browser only if its HTML is a JavaScript shell, and measured: HTTP status, sizes, page state, property signals, and why it is accepted or rejected.</p>
          </div>
        )}
        {type === "paste" && (
          <div>
            <label className={label} htmlFor="d-paste">Notice text</label>
            <textarea id="d-paste" name="pasted" rows={8} placeholder="Paste a public auction notice here…" className={field} />
            <p className="mt-1 text-[11px] text-brand-muted">If the text has several lots, only the first property is used.</p>
          </div>
        )}
        {type === "sample" && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="mock" className="mt-0.5" />
            <span>Mock extraction: show the sample result without calling the AI (otherwise the existing Relay extraction is used).</span>
          </label>
        )}

        {isWeb && (
          <details className="rounded-lg border border-brand-border p-3">
            <summary className="cursor-pointer text-xs font-semibold">Scan settings (limits)</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <label>Max pages<input name="maxPages" type="number" min={1} max={150} defaultValue={s.maxPages} className={field} /></label>
              <label>Max depth<input name="maxDepth" type="number" min={0} max={5} defaultValue={s.maxDepth} className={field} /></label>
              <label>Max property candidates<input name="maxCandidates" type="number" min={1} max={40} defaultValue={s.maxCandidates} className={field} /></label>
              <label>Max pages for the selected property<input name="maxDeepPages" type="number" min={1} max={40} defaultValue={s.maxDeepPages} className={field} /></label>
              <label>Max runtime (seconds)<input name="timeLimitSec" type="number" min={20} max={200} defaultValue={s.timeLimitSec} className={field} /></label>
              <label>Pages fetched side by side<input name="concurrency" type="number" min={1} max={4} defaultValue={s.concurrency} className={field} /></label>
              <label>Max browser-rendered pages<input name="maxBrowserPages" type="number" min={0} max={20} defaultValue={s.maxBrowserPages} className={field} /></label>
              <div className="space-y-2 pt-5">
                <label className="flex items-center gap-2"><input type="checkbox" name="useSitemap" defaultChecked />Use public sitemap</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="useBrowser" defaultChecked />Browser rendering for JS pages</label>
              </div>
            </div>
          </details>
        )}

        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-lg bg-brand-bg px-3 py-2 text-xs">
          <dt className="text-brand-muted">Status</dt>
          <dd className="font-medium">{pending ? "RUNNING…" : r ? r.status : "Not run yet"}</dd>
          <dt className="text-brand-muted">Input method</dt>
          <dd className="font-medium">{type === "sample" ? "Sample" : type === "paste" ? "Paste" : type === "url" ? "Permitted public website" : "Diagnose page addresses"}</dd>
        </dl>
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? "Running demo…" : "Run Demo"}
        </button>
        <p className="text-[11px] text-brand-muted">DEMO MODE — no production data will be changed.</p>
      </form>

      {/* Results */}
      <div className="min-w-0 space-y-5">
        {!r && !pending && <div className="rounded-xl border border-dashed border-brand-border bg-white px-6 py-14 text-center text-sm text-brand-muted">Pick a source and press <strong>Run Demo</strong>. The website scan, the ONE selected property and its full package appear here.</div>}
        {pending && <div className="rounded-xl border border-brand-border bg-white px-6 py-14 text-center text-sm text-brand-muted">Scanning, rendering and extracting… a website run can take a few minutes. Keep this page open.</div>}

        {r && !pending && (
          <>
            {/* Run status */}
            <section className={card}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">Run status</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-xs text-brand-muted">{(r.durationMs / 1000).toFixed(1)} s · {r.limits.requestsMade} request(s) · DEMO MODE</span>
              </div>
              {r.reason && (
                <div role="alert" className={`mb-4 rounded-lg px-3 py-2 text-sm ${r.status === "REFUSED" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-800"}`}>
                  {r.reason}
                  {r.status === "REFUSED" && <div className="mt-1 text-xs">Permitted alternatives: the bank&apos;s own public notice, a PDF or CSV you supply, a Google Sheet, pasted text, or an authorised API/partner feed.</div>}
                </div>
              )}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <Stat k="Pages scanned" v={r.scan.pagesScanned} />
                <Stat k="Pages discovered" v={r.scan.pagesDiscovered} />
                <Stat k="Property candidates" v={r.scan.propertyCandidates} />
                <Stat k="Selected property" v={r.counts.propertiesSelected} />
                <Stat k="Related pages" v={r.collection.pages.filter((x) => x.label !== "Property detail page" && !x.label.startsWith("Property detail page")).length} />
                <Stat k="Documents" v={r.collection.documents.length} />
                <Stat k="Images" v={r.collection.images.length} />
                <Stat k="AI tokens" v={r.extraction.tokens ? r.extraction.tokens.toLocaleString("en-IN") : "—"} />
              </div>
              <Pipeline r={r} />
            </section>

            {r.source.type === "url" && r.source.url && r.status !== "REFUSED" && (
              <section className="rounded-xl border-2 border-gold bg-white p-5">
                <h2 className="mb-1 font-semibold">Go live with this website</h2>
                <p className="mb-3 text-xs text-brand-muted">
                  The demo shows ONE property in full. As a <strong>Live source</strong> the whole website is scanned: every property page is found and read
                  in full (details + notice PDFs), new properties are picked up automatically every hour, and you can Pause it any time in Data Engine.
                </p>
                <form action={addAsLiveSource} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="url" value={r.source.url} />
                  <label className="min-w-[200px] flex-1 text-xs font-semibold">Source name<input name="name" defaultValue={r.source.name === "Demo source" ? "" : r.source.name} placeholder={new URL(r.source.url).hostname.replace(/^www\./, "")} className={field} /></label>
                  <button type="submit" className="rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-dark">Add as Live source &amp; import everything</button>
                </form>
              </section>
            )}

            {(r.source.type === "url" || r.source.type === "diagnose") && (
              <section className={card}>
                <h2 className="mb-3 font-semibold">Access check (start page)</h2>
                <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  <Row k="Host" v={r.access.host ?? "—"} />
                  <Row k="Matched demo deny-list" v={r.access.denyListMatch ? `Yes (${r.access.denyListMatch})` : "No (the demo deny-list is empty)"} />
                  <Row k="Access check (robots.txt)" v={r.access.robots ?? "not reached"} />
                  <Row k="HTTP status" v={r.access.httpStatus ?? "no page request made"} />
                  <Row k="Collection status" v={r.access.collection} />
                  <Row k="Reason" v={r.reason ?? (r.access.collection === "COLLECTED" ? "HTTP 200: page collected" : "—")} />
                </dl>
              </section>
            )}

            {/* Website scan */}
            {r.source.type === "url" && r.scan.pagesScanned + r.scan.pagesRefused + r.scan.pagesFailed > 0 && (
              <section className={card}>
                <h2 className="mb-3 font-semibold">Website Scan</h2>
                <dl className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  <Row k="Start URL" v={r.scan.startUrl} />
                  <Row k="Domain" v={r.scan.domain} />
                  <Row k="Pages discovered" v={r.scan.pagesDiscovered} />
                  <Row k="Pages scanned" v={`${r.scan.pagesScanned} (limit ${r.settings.maxPages})`} />
                  <Row k="Pages skipped" v={r.scan.pagesSkipped} />
                  <Row k="Pages refused" v={r.scan.pagesRefused} />
                  <Row k="Pages failed" v={r.scan.pagesFailed} />
                  <Row k="Property candidates" v={`${r.scan.propertyCandidates} found, ${r.scan.candidatesChecked} fetched and scored`} />
                  <Row k="Listing pages" v={r.scan.listingPages} />
                  <Row k="Pagination pages" v={r.scan.paginationPages} />
                  <Row k="Documents found" v={r.scan.documentsFound} />
                  <Row k="Images found" v={r.scan.imagesFound} />
                  <Row k="Sitemap" v={r.scan.sitemapNote} />
                  <Row k="Browser renderer" v={`${r.scan.browser.requested ? "on" : "off"} · ${r.scan.browser.used} page(s) rendered · ${r.scan.browser.status}`} />
                  <Row k="Discovery path" v={r.discovery.path.length ? r.discovery.path.join(" → ") : "—"} />
                  <Row k="Selected property" v={r.discovery.selected ? <><div>{r.discovery.selected.title ?? "(untitled)"}</div><div className="text-xs font-normal text-brand-muted">{r.discovery.selected.url} · score {r.discovery.selected.score} ({r.discovery.selected.label})</div></> : "none"} />
                </dl>
              </section>
            )}

            {/* Candidate diagnostics */}
            {r.candidates.length > 0 && (
              <section>
                <h2 className="mb-3 font-semibold">Candidate diagnostics</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {r.candidates.map((c, i) => <CandidateCard key={c.url + i} c={c} />)}
                </div>
              </section>
            )}

            {/* The ONE property */}
            {r.status === "COMPLETED" && p && (
              <>
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat k="Properties discovered" v={r.counts.propertiesDiscovered} />
                  <Stat k="Selected" v={r.counts.propertiesSelected} />
                  <Stat k="Deep scanned" v={r.counts.propertiesSelected} />
                  <Stat k="Properties extracted" v={r.counts.propertiesExtracted} />
                </section>

                {r.collection.pages.length > 0 && (
                  <section className={card}>
                    <h2 className="mb-3 font-semibold">Deep scan (this property only)</h2>
                    <ul className="space-y-1.5 text-xs">
                      {r.collection.pages.map((pg) => (
                        <li key={pg.url + pg.label} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PAGE_STYLE[pg.status]}`}>{pg.status}</span>
                          <span className="font-medium">{pg.label}</span>
                          <span className="min-w-0 break-all text-brand-muted">{pg.url}</span>
                          {pg.note && <span className="w-full text-red-700">{pg.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className={card}>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h2 className="font-semibold">Property (1 of 1) — DEMO REVIEW</h2>
                    <span className="text-xs text-brand-muted">
                      Extraction: {r.extraction.mode === "AI" ? "existing Relay extraction (client and AI rules reused, no changes)" : "MOCK sample response (AI not called)"}
                      {r.extraction.model ? ` · ${r.extraction.model}` : ""}
                      {r.extraction.tokens ? ` · ${r.extraction.tokens.toLocaleString("en-IN")} tokens` : ""}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug">{p.fields.find((f) => f.key === "title")?.value ?? r.discovery.selected?.title ?? "(no title)"}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Stat k="Complete fields" v={r.counts.complete} />
                    <Stat k="Missing fields" v={r.counts.missing} />
                    <Stat k="Documents" v={r.counts.documents} />
                    <Stat k="Images" v={r.counts.images} />
                    <Stat k="Source pages" v={r.counts.sourcePages} />
                  </div>
                  {p.warnings.length > 0 && (
                    <ul className="mt-4 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      {p.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                    </ul>
                  )}
                </section>

                <div className="space-y-3">
                  {GROUPS.map((g, i) => {
                    const list = p.fields.filter((f) => f.group === g.key);
                    const found = list.filter((f) => f.value).length;
                    return (
                      <Section key={g.key} title={g.label} count={`${found} of ${list.length} fields`} open={i === 0}>
                        <Fields list={list} />
                      </Section>
                    );
                  })}

                  <Section title="Documents" count={`${r.collection.documents.length} found`}>
                    {r.collection.documents.length === 0 ? (
                      <p className="text-xs italic text-brand-muted">No public documents were found on the collected pages.</p>
                    ) : (
                      <ol className="list-decimal space-y-2 pl-5">
                        {r.collection.documents.map((d) => (
                          <li key={d.url} className="text-xs">
                            <div className="font-semibold">{d.title} <span className="font-normal text-brand-muted">· {d.type}</span></div>
                            <div className="break-all text-brand-muted">{d.url}</div>
                            <div className="mt-0.5 text-brand-muted">MIME: {d.mime ?? "—"} · size: {kb(d.sizeBytes)} · date: {d.date ?? "—"} · check: {d.check} · source: {d.sourcePage}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>

                  <Section title="Images" count={`${r.collection.images.length} found (references only, nothing is downloaded)`}>
                    {r.collection.images.length === 0 ? (
                      <p className="text-xs italic text-brand-muted">No property images were found.</p>
                    ) : (
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {r.collection.images.map((im) => (
                          <li key={im.url} className="flex gap-3 text-xs">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={im.url} alt={im.alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="h-16 w-24 shrink-0 rounded-lg border border-brand-border object-cover" />
                            <div className="min-w-0">
                              <div className="break-all text-brand-muted">{im.url}</div>
                              <div>alt: {im.alt ?? "—"} · title: {im.title ?? "—"} · {im.kind}</div>
                              <div className="break-all text-brand-muted">source: {im.sourcePage}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="Source References" count={`${r.collection.links.length} links`}>
                    {r.collection.links.length === 0 ? (
                      <p className="text-xs italic text-brand-muted">No source links (text-only source).</p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {r.collection.links.map((l, i) => (
                          <li key={l.url + i} className="break-all"><span className="font-semibold">{l.kind}:</span> <span className="text-brand-muted">{l.url}</span></li>
                        ))}
                      </ul>
                    )}
                    {r.collection.refused.length > 0 && (
                      <div className="mt-3 border-t border-brand-border pt-3">
                        <div className="mb-1 text-xs font-semibold text-red-700">Refused (not collected)</div>
                        <ul className="space-y-1 text-xs">
                          {r.collection.refused.map((x, i) => <li key={i} className="break-all">{x.url} — {x.reason}</li>)}
                        </ul>
                      </div>
                    )}
                  </Section>

                  <Section title="Raw Source" count={`${r.raw.text.length.toLocaleString("en-IN")} characters of text${r.raw.truncated ? " (shortened for display)" : ""}`}>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-xs font-semibold">Normalized text</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-brand-bg p-3 text-xs">{r.raw.text}</pre>
                      </div>
                      {r.raw.jsonLd.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-semibold">Structured data (JSON-LD)</div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-brand-bg p-3 text-xs">{r.raw.jsonLd.join("\n\n")}</pre>
                        </div>
                      )}
                      <div>
                        <div className="mb-1 text-xs font-semibold">Raw HTML / text as collected</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-brand-bg p-3 text-xs">{r.raw.html}</pre>
                      </div>
                    </div>
                  </Section>
                </div>
              </>
            )}

            {/* Scan Debug */}
            {r.pages.length > 0 && (
              <Section title="Scan Debug" count={`${r.pages.length} page request(s)`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-[11px]">
                    <thead className="text-brand-muted">
                      <tr>
                        <th className="py-1 pr-2">URL</th>
                        <th className="py-1 pr-2">HTTP</th>
                        <th className="py-1 pr-2">Render</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Score</th>
                        <th className="py-1 pr-2">Text</th>
                        <th className="py-1 pr-2">Links</th>
                        <th className="py-1 pr-2">ms</th>
                        <th className="py-1">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.pages.map((pg, i) => (
                        <tr key={pg.url + i} className="border-t border-brand-border align-top">
                          <td className="max-w-[220px] break-all py-1 pr-2">{pg.url}<div className="text-brand-muted">{pg.phase} · depth {pg.depth}</div></td>
                          <td className="py-1 pr-2">{pg.httpStatus ?? "—"}</td>
                          <td className="py-1 pr-2">{pg.mode}</td>
                          <td className="py-1 pr-2">{pg.kind}</td>
                          <td className="py-1 pr-2">{pg.score ?? "—"}{pg.label ? ` ${pg.label}` : ""}</td>
                          <td className="py-1 pr-2">{n0(pg.textChars)}{pg.jsShell ? " (JS shell)" : ""}</td>
                          <td className="py-1 pr-2">{pg.links}</td>
                          <td className="py-1 pr-2">{pg.ms}</td>
                          <td className="py-1 break-words">{pg.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
