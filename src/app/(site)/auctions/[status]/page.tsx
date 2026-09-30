import Link from "next/link";
import { notFound } from "next/navigation";
import PropertyCard from "@/components/PropertyCard";
import { auctionToCardData, listAuctionsByStatus } from "@/lib/queries/listAuctions";
import { AuctionStatus } from "@prisma/client";

export const revalidate = 120;

const STATUS_MAP: Record<string, AuctionStatus[]> = {
  upcoming: ["UPCOMING"],
  live: ["LIVE", "AUCTION_TODAY"],
  completed: ["COMPLETED"],
  postponed: ["POSTPONED"],
  cancelled: ["CANCELLED"],
};

const TABS = [
  { label: "All", href: "/auctions" },
  { label: "Upcoming", href: "/auctions/upcoming" },
  { label: "Live", href: "/auctions/live" },
  { label: "Completed", href: "/auctions/completed" },
  { label: "Postponed", href: "/auctions/postponed" },
  { label: "Cancelled", href: "/auctions/cancelled" },
];

export default async function AuctionsStatusPage({ params }: { params: Promise<{ status: string }> }) {
  const { status } = await params;
  const statuses = STATUS_MAP[status];
  if (!statuses) notFound();

  const auctions = await listAuctionsByStatus(statuses);

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1 capitalize">{status} Auctions</h1>
      <p className="text-brand-muted text-sm mb-5">{auctions.length} auction(s)</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`text-sm px-3 py-1.5 rounded-lg border ${
              t.href === `/auctions/${status}` ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {auctions.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No {status} auctions right now.</p>
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
