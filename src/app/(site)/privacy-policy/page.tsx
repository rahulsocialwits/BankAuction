import { getSiteSettings } from "@/lib/queries/siteSettings";

export const revalidate = 120;

export default async function PrivacyPolicyPage() {
  const s = await getSiteSettings();
  return (
    <main className="max-w-3xl mx-auto px-5 py-14">
      <h1 className="text-2xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{s.privacyPolicy}</p>
    </main>
  );
}
