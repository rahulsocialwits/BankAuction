import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { PAGE_KEYS, PAGE_META, cleanPage, DEFAULTS, type AboutContent, type FaqContent, type PageKey, type PolicyContent } from "@/lib/pages/content";
import PageForm from "@/components/admin/PageForm";
import MediaPicker from "@/components/admin/MediaPicker";
import SubmitButton from "@/components/admin/SubmitButton";
import { FaqEditor, PolicyEditor } from "@/components/admin/ListEditors";
import { resetPage, savePage } from "../actions";

export const dynamic = "force-dynamic";

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";
const label = "block text-xs font-semibold mb-1";

function Field({ name, text, value, rows, hint }: { name: string; text: string; value: string; rows?: number; hint?: string }) {
  return (
    <div>
      <label className={label}>{text}</label>
      {rows ? <textarea name={name} defaultValue={value} rows={rows} className={input} /> : <input name={name} defaultValue={value} className={input} />}
      {hint && <p className="text-[11px] text-brand-muted mt-1">{hint}</p>}
    </div>
  );
}

function AboutFields({ c }: { c: AboutContent }) {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-brand-border rounded-xl p-5 grid gap-4">
        <h2 className="font-semibold">Picture</h2>
        <div className="grid sm:grid-cols-[180px_1fr] gap-5 items-start">
          <div className="aspect-square rounded-xl bg-brand-bg overflow-hidden flex items-center justify-center text-xs text-brand-muted">
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              "Illustration (no picture yet)"
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs text-brand-muted">Recommended size <b>1200 × 1200 px</b> (square), JPG, PNG or WebP under 1.5 MB. It is cropped to a square, so keep the subject in the middle. Works on phones and desktops.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" className="text-xs" />
              <MediaPicker mode="url" inputName="imageUrl" />
            </div>
            <div>
              <label className={label}>Picture link (filled in when you pick from the library)</label>
              <input name="imageUrl" defaultValue={c.imageUrl} placeholder="/api/media/…" className={input} />
            </div>
            <label className="flex items-center gap-2 text-xs text-brand-muted"><input type="checkbox" name="removeImage" /> Remove the picture (show the illustration)</label>
            <Field name="imageAlt" text="Picture description (for screen readers and Google)" value={c.imageAlt} />
          </div>
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 grid gap-4">
        <h2 className="font-semibold">Story</h2>
        <Field name="title" text="Heading" value={c.title} />
        <Field name="intro" text="Introduction" value={c.intro} rows={5} hint="Blank line = new paragraph · **bold** · [link](https://…)" />
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 grid md:grid-cols-2 gap-6">
        <div className="grid gap-3">
          <h2 className="font-semibold">Mission</h2>
          <Field name="missionTitle" text="Heading" value={c.missionTitle} />
          <Field name="missionPoints" text="Points (one per line)" value={c.missionPoints.join("\n")} rows={7} hint="Start a point with **bold words** to highlight them." />
        </div>
        <div className="grid gap-3">
          <h2 className="font-semibold">Vision</h2>
          <Field name="visionTitle" text="Heading" value={c.visionTitle} />
          <Field name="visionPoints" text="Points (one per line)" value={c.visionPoints.join("\n")} rows={7} />
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 grid sm:grid-cols-2 gap-4">
        <h2 className="font-semibold sm:col-span-2">Button (optional)</h2>
        <Field name="buttonLabel" text="Button text" value={c.buttonLabel} hint="Leave empty to hide the button." />
        <Field name="buttonHref" text="Button link" value={c.buttonHref} hint="e.g. /how-it-works or https://…" />
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 grid gap-3">
        <div>
          <h2 className="font-semibold">Search engines (SEO)</h2>
          <p className="text-xs text-brand-muted">What Google shows for this page. Leave empty to use the defaults.</p>
        </div>
        <Field name="seoTitle" text="Page title (up to 60 characters)" value={c.seoTitle} />
        <Field name="seoDescription" text="Meta description (up to 160 characters)" value={c.seoDescription} rows={2} />
      </section>
    </div>
  );
}

export default async function PageEditor({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ reset?: string }> }) {
  await requireMaster();
  const [{ key }, { reset }] = await Promise.all([params, searchParams]);
  if (!PAGE_KEYS.includes(key as PageKey)) notFound();
  const k = key as PageKey;
  const meta = PAGE_META[k];

  const row = await prisma.sitePage.findUnique({ where: { key: k } });
  const content = row ? cleanPage(k, row.data) : DEFAULTS[k];

  return (
    <div className="w-full">
      <Link href="/admin/pages" className="text-xs text-brand-muted hover:text-brand">← All pages</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-brand">{meta.label}</h1>
          <p className="text-xs text-brand-muted mt-1">{row ? `Customised · last saved ${row.updatedAt.toLocaleString("en-IN")}` : "Showing the built-in text. Save to customise it."}</p>
        </div>
        {row && (
          <form action={resetPage}>
            <input type="hidden" name="pageKey" value={k} />
            <SubmitButton className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-2 hover:bg-red-50">Reset to the built-in text</SubmitButton>
          </form>
        )}
      </div>
      {reset && <div role="status" className="bg-green-50 text-green-800 text-sm rounded-lg px-3 py-2 mb-4">✓ This page is back to the built-in text.</div>}
      {meta.kind === "policy" && (
        <p className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2 mb-5 max-w-3xl">
          The built-in text is a sensible starting point, not legal advice. Have your own policy text checked by a lawyer before relying on it.
        </p>
      )}

      <PageForm action={savePage} pageKey={k} viewPath={meta.path}>
        {meta.kind === "about" ? <AboutFields c={content as AboutContent} /> : meta.kind === "faq" ? <FaqEditor initial={content as FaqContent} /> : <PolicyEditor initial={content as PolicyContent} />}
      </PageForm>
    </div>
  );
}
