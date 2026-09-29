import Link from "next/link";
import PropertyCard from "@/components/PropertyCard";
import { auctionToCardData, listAuctionsByStatus } from "@/lib/queries/listAuctions";

export const dynamic = "force-dynamic";

const TABS = [
  { label: "All", href: "/auctions" },
  { label: "Upcoming", href: "/auctions/upcoming" },
  { label: "Live", href: "/auctions/live" },
  { label: "Completed", href: "/auctions/completed" },
  { label: "Postponed", href: "/auctions/postponed" },
  { label: "Cancelled", href: "/auctions/cancelled" },
];

export default async function AuctionsPage() {
  const auctions = await listAuctionsByStatus(["UPCOMING", "LIVE", "AUCTION_TODAY", "COMPLETED", "POSTPONED", "CANCELLED"]);

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-2xl font-semibold mb-1">Auctions</h1>
      <p className="text-brand-muted text-sm mb-5">{auctions.length} auction(s)</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="text-sm px-3 py-1.5 rounded-lg border border-brand-border text-brand-muted hover:border-brand hover:text-brand">
            {t.label}
          </Link>
        ))}
      </div>

      {auctions.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No auctions yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {auctions.map((a) => (
            <PropertyCard key={a.id} property={auctionToCardData(a)} />
          ))}
        </div>
      )}
    </main>
  );
}
