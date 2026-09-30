import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/queries/siteSettings";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How BankAuction.co collects, uses and protects your information.",
  alternates: { canonical: "/privacy-policy" },
};

export default async function PrivacyPolicyPage() {
  const s = await getSiteSettings();
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{s.privacyPolicy}</p>
    </main>
  );
}
