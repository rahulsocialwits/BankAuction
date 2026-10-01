"use client";

import { useState } from "react";
import type { FaqContent, PolicyContent } from "@/lib/pages/content";

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";
const label = "block text-xs font-semibold mb-1";
const mini = "text-xs border border-brand-border rounded px-2 py-1 hover:bg-brand-bg disabled:opacity-30";

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Seo({ title, description, onTitle, onDescription }: { title: string; description: string; onTitle: (v: string) => void; onDescription: (v: string) => void }) {
  return (
    <section className="bg-white border border-brand-border rounded-xl p-5">
      <h2 className="font-semibold mb-1">Search engines (SEO)</h2>
      <p className="text-xs text-brand-muted mb-3">What Google shows for this page. Leave empty to use sensible defaults.</p>
      <div className="grid gap-3">
        <div>
          <label className={label}>Page title <span className="font-normal text-brand-muted">({title.length}/60)</span></label>
          <input value={title} onChange={(e) => onTitle(e.target.value)} maxLength={70} className={input} placeholder="Shown in the browser tab and Google results" />
        </div>
        <div>
          <label className={label}>Meta description <span className="font-normal text-brand-muted">({description.length}/160)</span></label>
          <textarea value={description} onChange={(e) => onDescription(e.target.value)} maxLength={170} rows={2} className={input} placeholder="One or two sentences that make people click" />
        </div>
      </div>
    </section>
  );
}

const FORMAT_HELP = "Blank line = new paragraph · start a line with “- ” for a bullet · **bold** · [link text](https://…) or (/contact)";

/** Privacy / Terms / Disclaimer: hero text, "last updated" and an ordered list of sections. */
export function PolicyEditor({ initial }: { initial: PolicyContent }) {
  const [c, setC] = useState(initial);
  const set = <K extends keyof PolicyContent>(k: K, v: PolicyContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const setSection = (i: number, patch: Partial<PolicyContent["sections"][number]>) => set("sections", c.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-6">
      <input type="hidden" name="content" value={JSON.stringify(c)} />

      <section className="bg-white border border-brand-border rounded-xl p-5 grid gap-3">
        <h2 className="font-semibold">Top banner</h2>
        <div>
          <label className={label}>Heading</label>
          <input value={c.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Sub-heading</label>
          <textarea value={c.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} rows={2} className={input} />
        </div>
        <div className="max-w-xs">
          <label className={label}>Last updated</label>
          <input value={c.lastUpdated} onChange={(e) => set("lastUpdated", e.target.value)} placeholder="e.g. 1 October 2026" className={input} />
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h2 className="font-semibold">Sections</h2>
          <span className="text-xs text-brand-muted">{c.sections.length} section{c.sections.length === 1 ? "" : "s"}; they also form the Quick Navigation menu</span>
        </div>
        <p className="text-xs text-brand-muted mb-4">{FORMAT_HELP}</p>
        <div className="space-y-4">
          {c.sections.map((s, i) => (
            <div key={i} className="border border-brand-border rounded-xl p-4 bg-brand-bg/40">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-brand-muted w-6">{i + 1}.</span>
                <input value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} placeholder="Section heading" className={`${input} font-medium`} />
                <button type="button" className={mini} disabled={i === 0} onClick={() => set("sections", move(c.sections, i, -1))} aria-label="Move up">↑</button>
                <button type="button" className={mini} disabled={i === c.sections.length - 1} onClick={() => set("sections", move(c.sections, i, 1))} aria-label="Move down">↓</button>
                <button type="button" className={`${mini} text-red-600`} onClick={() => confirm("Delete this section?") && set("sections", c.sections.filter((_, j) => j !== i))}>Delete</button>
              </div>
              <textarea value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} rows={6} placeholder="Section text" className={input} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set("sections", [...c.sections, { id: "", title: "", body: "" }])} className="mt-4 text-sm border border-brand-border rounded-lg px-4 py-2 hover:bg-brand-bg">+ Add section</button>
      </section>

      <Seo title={c.seoTitle} description={c.seoDescription} onTitle={(v) => set("seoTitle", v)} onDescription={(v) => set("seoDescription", v)} />
    </div>
  );
}

/** FAQ: hero text and categories, each with its own questions and answers. */
export function FaqEditor({ initial }: { initial: FaqContent }) {
  const [c, setC] = useState(initial);
  const set = <K extends keyof FaqContent>(k: K, v: FaqContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const setCat = (i: number, fn: (cat: FaqContent["categories"][number]) => FaqContent["categories"][number]) => set("categories", c.categories.map((x, j) => (j === i ? fn(x) : x)));

  return (
    <div className="space-y-6">
      <input type="hidden" name="content" value={JSON.stringify(c)} />

      <section className="bg-white border border-brand-border rounded-xl p-5 grid gap-3">
        <h2 className="font-semibold">Top banner</h2>
        <div>
          <label className={label}>Heading</label>
          <input value={c.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Sub-heading</label>
          <textarea value={c.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} rows={2} className={input} />
        </div>
      </section>

      {c.categories.map((cat, ci) => (
        <section key={ci} className="bg-white border border-brand-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <input value={cat.name} onChange={(e) => setCat(ci, (x) => ({ ...x, name: e.target.value }))} placeholder="Category name (a tab)" className={`${input} font-semibold max-w-sm`} />
            <button type="button" className={mini} disabled={ci === 0} onClick={() => set("categories", move(c.categories, ci, -1))} aria-label="Move category left">↑</button>
            <button type="button" className={mini} disabled={ci === c.categories.length - 1} onClick={() => set("categories", move(c.categories, ci, 1))} aria-label="Move category right">↓</button>
            <button type="button" className={`${mini} text-red-600 ml-auto`} onClick={() => confirm(`Delete the whole “${cat.name || "category"}” tab and its questions?`) && set("categories", c.categories.filter((_, j) => j !== ci))}>Delete category</button>
          </div>
          <p className="text-xs text-brand-muted mb-3">{FORMAT_HELP}</p>
          <div className="space-y-3">
            {cat.items.map((it, ii) => (
              <div key={ii} className="border border-brand-border rounded-xl p-3 bg-brand-bg/40">
                <div className="flex items-center gap-2 mb-2">
                  <input value={it.q} onChange={(e) => setCat(ci, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, q: e.target.value } : y)) }))} placeholder="Question" className={`${input} font-medium`} />
                  <button type="button" className={mini} disabled={ii === 0} onClick={() => setCat(ci, (x) => ({ ...x, items: move(x.items, ii, -1) }))} aria-label="Move up">↑</button>
                  <button type="button" className={mini} disabled={ii === cat.items.length - 1} onClick={() => setCat(ci, (x) => ({ ...x, items: move(x.items, ii, 1) }))} aria-label="Move down">↓</button>
                  <button type="button" className={`${mini} text-red-600`} onClick={() => setCat(ci, (x) => ({ ...x, items: x.items.filter((_, k) => k !== ii) }))}>Delete</button>
                </div>
                <textarea value={it.a} onChange={(e) => setCat(ci, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, a: e.target.value } : y)) }))} rows={3} placeholder="Answer" className={input} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setCat(ci, (x) => ({ ...x, items: [...x.items, { q: "", a: "" }] }))} className="mt-3 text-sm border border-brand-border rounded-lg px-4 py-2 hover:bg-brand-bg">+ Add question</button>
        </section>
      ))}
      <button type="button" onClick={() => set("categories", [...c.categories, { id: "", name: "", items: [{ q: "", a: "" }] }])} className="text-sm border border-brand-border rounded-lg px-4 py-2 bg-white hover:bg-brand-bg">+ Add category (tab)</button>

      <Seo title={c.seoTitle} description={c.seoDescription} onTitle={(v) => set("seoTitle", v)} onDescription={(v) => set("seoDescription", v)} />
    </div>
  );
}
