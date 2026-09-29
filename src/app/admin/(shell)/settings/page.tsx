import { getSiteSettings } from "@/lib/queries/siteSettings";
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

export default async function AdminSettingsPage() {
  const s = await getSiteSettings();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Site Settings</h1>
      <p className="text-sm text-brand-muted mb-6">
        Contact info, social links and policy pages shown across the public site. Changes apply immediately.
      </p>

      <form action={saveSiteSettings} className="space-y-8 max-w-2xl">
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

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Policy Pages</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Privacy Policy</label>
            <textarea name="privacyPolicy" defaultValue={s.privacyPolicy} rows={5} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Terms and Conditions</label>
            <textarea name="termsAndConditions" defaultValue={s.termsAndConditions} rows={5} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Disclaimer</label>
            <textarea name="disclaimer" defaultValue={s.disclaimer} rows={5} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </section>

        <button type="submit" className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">
          Save Settings
        </button>
      </form>
    </div>
  );
}
