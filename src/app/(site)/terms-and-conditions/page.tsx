import { getSiteSettings } from "@/lib/queries/siteSettings";

export const revalidate = 120;

export default async function TermsPage() {
  const s = await getSiteSettings();
  return (
    <main className="max-w-3xl mx-auto px-5 py-14">
      <h1 className="text-2xl font-semibold mb-6">Terms and Conditions</h1>
      <p className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{s.termsAndConditions}</p>
    </main>
  );
}
