import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalProperties,
    published,
    pendingReview,
    upcoming,
    live,
    completed,
    newToday,
    sources,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.property.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.auction.count({ where: { status: "UPCOMING" } }),
    prisma.auction.count({ where: { status: { in: ["LIVE", "AUCTION_TODAY"] } } }),
    prisma.auction.count({ where: { status: "COMPLETED" } }),
    prisma.property.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.source.findMany({ orderBy: { name: "asc" } }),
  ]);

  const cards = [
    { label: "Total Properties", value: totalProperties, href: "/admin/properties" },
    { label: "Published", value: published, href: "/admin/properties" },
    { label: "Pending Review", value: pendingReview, href: "/admin/properties" },
    { label: "New Today", value: newToday, href: "/admin/properties" },
    { label: "Upcoming Auctions", value: upcoming, href: "/admin/properties" },
    { label: "Live / Today", value: live, href: "/admin/properties" },
    { label: "Completed Auctions", value: completed, href: "/admin/properties" },
  ];

  const statusColors: Record<string, string> = {
    HEALTHY: "bg-green-50 text-green-700",
    WARNING: "bg-amber-50 text-amber-700",
    FAILED: "bg-red-50 text-red-700",
    DISABLED: "bg-gray-100 text-gray-600",
    RESTRICTED: "bg-gray-100 text-gray-500",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Dashboard</h1>
      <p className="text-sm text-brand-muted mb-6">Live snapshot of the ingestion pipeline and review queue.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand transition-colors">
            <div className="text-2xl font-bold text-brand">{c.value}</div>
            <div className="text-xs text-brand-muted mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">Source health</h2>
      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Last successful sync</th>
              <th className="px-4 py-2.5">Access notes</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-brand-muted">
                  No sources registered yet — run an ingestion job first.
                </td>
              </tr>
            )}
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-brand-border">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusColors[s.status] ?? ""}`}>{s.status}</span>
                </td>
                <td className="px-4 py-2.5 text-brand-muted">
                  {s.lastSuccessfulSync ? new Date(s.lastSuccessfulSync).toLocaleString("en-IN") : "Never"}
                </td>
                <td className="px-4 py-2.5 text-brand-muted max-w-xs truncate" title={s.accessNotes ?? ""}>
                  {s.accessNotes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
