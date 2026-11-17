import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { activeAuctionWhere } from "@/lib/domain/auctionLifecycle";
import { SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Auction Calendar — Upcoming Bank Auction Dates | BankAuction.co",
  description: "All upcoming and live bank auction deadlines in India — sorted by auction date. Find properties going to auction this week and next.",
  alternates: { canonical: `${SITE_URL}/auctions/calendar` },
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "Date TBA";
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

/** Group items by IST date string "YYYY-MM-DD" */
function groupByDate<T>(items: T[], getDate: (item: T) => Date | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = getDate(item);
    const key = d ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "tba";
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function fmt(key: string): string {
  if (key === "tba") return "Date TBA";
  const d = new Date(key + "T00:00:00+05:30");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (key === today) return "Today — " + fmtDate(d);
  if (key === tomorrow) return "Tomorrow — " + fmtDate(d);
  return fmtDate(d);
}

export default async function AuctionCalendarPage() {
  const auctions = await prisma.auction.findMany({
    where: { ...activeAuctionWhere(), auctionStart: { not: null }, property: { status: "PUBLISHED" } },
    orderBy: { auctionStart: "asc" },
    take: 500,
    select: {
      id: true,
      auctionStart: true,
      auctionEnd: true,
      reservePrice: true,
      property: {
        select: { id: true, slug: true, title: true, geoCity: true, geoState: true, category: true },
      },
    },
  });

  const grouped = groupByDate(auctions, (a) => a.auctionStart);
  const sortedKeys = [...grouped.keys()].sort((a, b) => (a === "tba" ? 1 : b === "tba" ? -1 : a.localeCompare(b)));

  const structured = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Upcoming Bank Auction Calendar",
    numberOfItems: auctions.length,
    itemListElement: auctions.slice(0, 20).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/property/${a.property.slug}`,
      name: a.property.title,
    })),
  };

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <JsonLd data={structured} />

      <nav className="text-xs text-brand-muted mb-4 flex items-center gap-1.5">
        <Link href="/" className="hover:text-brand">Home</Link>
        <span>/</span>
        <Link href="/auctions" className="hover:text-brand">Auctions</Link>
        <span>/</span>
        <span className="text-brand">Calendar</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl font-bold text-brand mb-2">Auction Calendar</h1>
      <p className="text-brand-muted text-sm mb-8">
        {auctions.length.toLocaleString("en-IN")} upcoming auction{auctions.length !== 1 ? "s" : ""} — sorted by date
      </p>

      {auctions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-border rounded-2xl">
          <p className="font-medium text-brand mb-1">No upcoming auctions found</p>
          <p className="text-sm text-brand-muted">Check back soon or <Link href="/properties" className="text-brand underline">browse all properties</Link>.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedKeys.map((key) => {
            const items = grouped.get(key)!;
            return (
              <section key={key}>
                <h2 className="text-base font-semibold text-brand mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-brand shrink-0" />
                  {fmt(key)}
                  <span className="text-xs font-normal text-brand-muted">({items.length})</span>
                </h2>
                <div className="rounded-xl border border-brand-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-bg text-brand-muted text-left text-xs">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Property</th>
                        <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Location</th>
                        <th className="px-4 py-2.5 font-medium hidden md:table-cell">Time</th>
                        <th className="px-4 py-2.5 font-medium text-right">Reserve ₹</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((a) => (
                        <tr key={a.id} className="border-t border-brand-border hover:bg-brand-bg/50">
                          <td className="px-4 py-3">
                            <Link href={`/property/${a.property.slug}`} className="font-medium text-brand hover:underline line-clamp-1">
                              {a.property.title}
                            </Link>
                            <span className="text-xs text-brand-muted capitalize block">
                              {a.property.category?.toLowerCase().replace(/_/g, " ") ?? ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-brand-muted hidden sm:table-cell text-xs">
                            {[a.property.geoCity, a.property.geoState].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-brand-muted hidden md:table-cell text-xs whitespace-nowrap">
                            {fmtTime(a.auctionStart)}
                            {a.auctionEnd && <span> – {fmtTime(a.auctionEnd)}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium text-brand whitespace-nowrap">
                            {a.reservePrice != null
                              ? `₹${Number(a.reservePrice).toLocaleString("en-IN")}`
                              : <span className="text-brand-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
