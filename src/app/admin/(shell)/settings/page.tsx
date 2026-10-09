import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { buildSettings } from "@/lib/queries/siteSettings";
import SettingsForm from "@/components/admin/SettingsForm";
import MediaPicker from "@/components/admin/MediaPicker";
import { saveSiteSettings } from "./actions";

export const dynamic = "force-dynamic";

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input name={name} defaultValue={defaultValue} type={type} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
    </div>
  );
}

function ImageField({ label, name, value, small }: { label: string; name: string; value: string; small?: boolean }) {
  const isData = value.startsWith("data:");
  return (
    <div className="grid sm:grid-cols-[96px_1fr] gap-4 items-start">
      <div className={`${small ? "h-16 w-16" : "h-16 w-24"} rounded-lg border border-brand-border bg-brand-bg flex items-center justify-center overflow-hidden`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[10px] text-brand-muted">Default</span>
        )}
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">{label}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" name={`${name}File`} accept="image/*,.ico" className="text-xs block" />
          <MediaPicker mode="url" inputName={name} />
        </div>
        <input
          name={name}
          defaultValue={isData ? "" : value}
          placeholder={isData ? "Uploaded image in use — paste a link to replace" : "…or paste an https:// image link"}
          className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-brand-muted">
          <input type="checkbox" name={`${name}Remove`} /> Reset to default
        </label>
      </div>
    </div>
  );
}

export default async function AdminSettingsPage() {
  // Read straight from the DB (not the cached public copy) so the form always shows what is saved.
  const s = buildSettings(await prisma.siteSettings.findFirst());

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Site Settings</h1>
      <p className="text-sm text-brand-muted mb-6">
        Contact info, social links and policy pages shown across the public site. Changes apply immediately.
      </p>

      <SettingsForm action={saveSiteSettings}>
        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-5">
          <div>
            <h2 className="font-semibold">Logos &amp; Site Icon</h2>
            <p className="text-xs text-brand-muted mt-1">Upload an image (PNG, JPG, WEBP, SVG or ICO, under 400 KB) or paste an https:// link. Leave both empty to keep the current one.</p>
          </div>
          <ImageField label="Header logo" name="headerLogoUrl" value={s.headerLogoUrl} />
          <ImageField label="Footer logo" name="footerLogoUrl" value={s.footerLogoUrl} />
          <ImageField label="Site icon (favicon)" name="faviconUrl" value={s.faviconUrl} small />
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Home Page SEO</h2>
          <Field label="Home page title" name="homeTitle" defaultValue={s.homeTitle} />
          <div>
            <label className="block text-sm font-medium mb-1">Home page description</label>
            <textarea name="homeDescription" defaultValue={s.homeDescription} rows={3} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-brand-muted mt-1">
              Leave empty and it is written automatically from live numbers (listings, banks, cities). Type your own text to override it. Best under 160 characters.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Keywords</label>
            <textarea name="homeKeywords" defaultValue={s.homeKeywords} rows={2} placeholder="bank auction, SARFAESI, flats under auction Mumbai" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-brand-muted mt-1">Comma separated.</p>
          </div>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Contact Info</h2>
          <Field label="Phone" name="phone" defaultValue={s.phone} />
          <Field label="General Email" name="generalEmail" defaultValue={s.generalEmail} type="email" />
          <Field label="Listings Email" name="listingsEmail" defaultValue={s.listingsEmail} type="email" />
          <Field label="Partnerships Email" name="partnershipsEmail" defaultValue={s.partnershipsEmail} type="email" />
          <Field label="Working Hours" name="workingHours" defaultValue={s.workingHours} />
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Social Links</h2>
          <Field label="Facebook URL" name="facebookUrl" defaultValue={s.facebookUrl} />
          <Field label="Instagram URL" name="instagramUrl" defaultValue={s.instagramUrl} />
          <Field label="LinkedIn URL" name="linkedinUrl" defaultValue={s.linkedinUrl} />
          <Field label="YouTube URL" name="youtubeUrl" defaultValue={s.youtubeUrl} />
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold">Policy pages</h2>
          <p className="text-sm text-brand-muted mt-1">
            Privacy Policy, Terms and Conditions, Disclaimer, About Us and FAQ are now edited under <Link href="/admin/pages" className="text-brand underline">Pages</Link>.
          </p>
        </section>

      </SettingsForm>
    </div>
  );
}
