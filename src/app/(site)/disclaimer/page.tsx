import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/queries/siteSettings";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "BankAuction.co lists publicly available auction information. Always verify details with the bank and official documents before bidding.",
  alternates: { canonical: "/disclaimer" },
};

export default async function DisclaimerPage() {
  const s = await getSiteSettings();
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-6">Disclaimer</h1>
      <p className="text-sm leading-7 text-black/80 whitespace-pre-wrap">{s.disclaimer}</p>
    </main>
  );
}
