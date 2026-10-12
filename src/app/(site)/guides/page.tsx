import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Bank auction guides",
  description: "Plain-language guides on how bank auctions work, EMD and reserve price, how to bid, and due diligence, for buyers, investors, brokers and lawyers.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-2">Bank auction guides</h1>
      <p className="text-brand-muted text-sm mb-8">General information to help you understand bank auctions. It is not legal or financial advice: the official notice of each auction always decides.</p>
      <ul className="grid sm:grid-cols-2 gap-4 list-none p-0 m-0">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`} className="block h-full bg-white border border-brand-border rounded-2xl p-5 hover:shadow-md transition-shadow">
              <div className="text-[11px] font-semibold text-gold mb-1">{g.audience}</div>
              <h2 className="font-semibold text-brand mb-1">{g.title}</h2>
              <p className="text-sm text-brand-muted">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
