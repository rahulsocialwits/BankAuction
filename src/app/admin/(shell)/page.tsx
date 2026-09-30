import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalProperties, published, pendingReview, upcoming, live, completed, newToday, leadsCount, sources, recent, recentLeads] =
    await Promise.all([
      prisma.property.count(),
      prisma.property.count({ where: { status: "PUBLISHED" } }),
      prisma.property.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.auction.count({ where: { status: "UPCOMING" } }),
      prisma.auction.count({ where: { status: { in: ["LIVE", "AUCTION_TODAY"] } } }),
      prisma.auction.count({ where: { status: "COMPLETED" } }),
      prisma.property.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.lead.count(),
      prisma.source.findMany({ orderBy: { name: "asc" } }),
      prisma.property.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, slug: true, title: true, status: true, createdAt: true },
      }),
      prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const cards = [
    { label: "Total Properties", value: totalProperties, href: "/admin/properties", tone: "text-brand" },
    { label: "Published", value: published, href: "/admin/properties", tone: "text-green-700" },
    { label: "Pending Review", value: pendingReview, href: "/admin/properties", tone: "text-amber-600" },
    { label: "New Today", value: newToday, href: "/admin/properties", tone: "text-brand" },
    { label: "Upcoming Auctions", value: upcoming, href: "/admin/properties", tone: "text-blue-700" },
    { label: "Live / Today", value: live, href: "/admin/properties", tone: "text-green-700" },
    { label: "Completed", value: completed, href: "/admin/properties", tone: "text-gray-600" },
    { label: "Leads", value: leadsCount, href: "/admin/leads", tone: "text-gold-dark" },
  ];

  const statusColors: Record<string, string> = {
    HEALTHY: "bg-green-50 text-green-700",
    WARNING: "bg-amber-50 text-amber-700",
    FAILED: "bg-red-50 text-red-700",
    DISABLED: "bg-gray-100 text-gray-600",
    RESTRICTED: "bg-gray-100 text-gray-500",
  };

  const quick = [
    { href: "/admin/properties/new", label: "Add property" },
    { href: "/admin/localities", label: "Manage locations" },
    { href: "/admin/blog/new", label: "Write blog post" },
    { href: "/admin/admins", label: "Add admin user" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
          <p className="text-sm text-brand-muted">Live snapshot of listings, leads and the ingestion pipeline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="text-xs font-medium bg-white border border-brand-border rounded-lg px-3 py-2 hover:border-brand hover:text-brand">
              {q.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand hover:shadow-sm transition">
            <div className={`text-3xl font-bold ${c.tone}`}>{c.value}</div>
            <div className="text-xs text-brand-muted mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm">Recently added properties</div>
          <ul>
            {recent.map((p) => (
              <li key={p.id} className="px-4 py-2.5 border-b border-brand-border last:border-0 flex items-center justify-between gap-3">
                <Link href={`/property/${p.slug}`} target="_blank" className="text-sm truncate hover:text-brand">{p.title}</Link>
                <span className="text-[11px] text-brand-muted shrink-0">{p.createdAt.toLocaleDateString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm flex justify-between">
            <span>Latest leads</span>
            <Link href="/admin/leads" className="text-xs text-brand font-medium">View all</Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="px-4 py-6 text-sm text-brand-muted text-center">No leads yet.</p>
          ) : (
            <ul>
              {recentLeads.map((l) => (
                <li key={l.id} className="px-4 py-2.5 border-b border-brand-border last:border-0 text-sm flex justify-between gap-3">
                  <span className="truncate">{l.name ?? "Unknown"}</span>
                  <span className="text-[11px] text-brand-muted shrink-0">{l.createdAt.toLocaleDateString("en-IN")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Source health</h2>
      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Last successful sync</th>
              <th className="px-4 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-brand-muted">No sources registered yet — run an ingestion job first.</td>
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
                <td className="px-4 py-2.5 text-brand-muted max-w-xs truncate" title={s.accessNotes ?? ""}>{s.accessNotes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
