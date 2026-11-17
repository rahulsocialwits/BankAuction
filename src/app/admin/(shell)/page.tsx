import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin } from "@/lib/auth/adminAuth";
import { auctionStatusWhere } from "@/lib/domain/auctionLifecycle";
import { tokensUsedLast24h, dailyCap } from "@/lib/ai/dailyBudget";
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const master = await isMasterAdmin();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [
    totalProperties,
    published,
    pendingReview,
    upcoming,
    live,
    completed,
    expired,
    newToday,
    recent,
    recentAuctions,
  ] = await Promise.all([
    prisma.property.count({ where: { status: { notIn: ["DUPLICATE", "REMOVED"] } } }),
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.property.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.auction.count({ where: { AND: [auctionStatusWhere(["UPCOMING"])], property: { status: "PUBLISHED" } } }),
    prisma.auction.count({ where: { AND: [auctionStatusWhere(["LIVE", "AUCTION_TODAY"])], property: { status: "PUBLISHED" } } }),
    prisma.auction.count({ where: { AND: [auctionStatusWhere(["COMPLETED"])], property: { status: "PUBLISHED" } } }),
    prisma.auction.count({ where: { status: "EXPIRED" } }),
    prisma.property.count({ where: { createdAt: { gte: startOfToday }, status: { notIn: ["DUPLICATE", "REMOVED"] } } }),
    prisma.property.findMany({
      where: { status: { notIn: ["DUPLICATE", "REMOVED"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, slug: true, title: true, status: true, createdAt: true },
    }),
    prisma.auction.findMany({
      where: { AND: [auctionStatusWhere(["UPCOMING"]), { property: { status: "PUBLISHED" } }] },
      orderBy: { auctionStart: "asc" },
      take: 5,
      select: { id: true, auctionStart: true, property: { select: { id: true, title: true, slug: true } } },
    }),
  ]);

  const duplicateCandidates = await prisma.property.count({ where: { status: "DUPLICATE" } }).catch(() => 0);

  // Scheduler health
  const [lastSuccessfulTick, lastFailedTick, runsLast24h] = await Promise.all([
    prisma.sourceRunLog.findFirst({ where: { kind: "cron", status: "ok" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.sourceRunLog.findFirst({ where: { kind: "cron", status: { not: "ok" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } }),
    prisma.sourceRunLog.count({ where: { kind: "cron", startedAt: { gte: twentyFourHoursAgo } } }),
  ]);

  // Ingestion stats (last 7 days)
  const [successfulRuns7d, failedRuns7d] = await Promise.all([
    prisma.sourceRunLog.count({ where: { kind: "cron", status: "ok", startedAt: { gte: sevenDaysAgo } } }),
    prisma.sourceRunLog.count({ where: { kind: "cron", status: { not: "ok" }, startedAt: { gte: sevenDaysAgo } } }),
  ]);

  // AI budget
  const [aiTokensUsed, aiCap] = await Promise.all([
    tokensUsedLast24h().catch(() => 0),
    Promise.resolve(dailyCap()),
  ]);
  const aiPct = aiCap > 0 ? Math.round((aiTokensUsed / aiCap) * 100) : 0;

  // Master-only
  const [leadsCount, usersCount, recentLeads, sources] = master
    ? await Promise.all([
        prisma.lead.count(),
        prisma.user.count(),
        prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.source.findMany({ orderBy: { name: "asc" } }),
      ])
    : [0, 0, [], []];

  const activeSources = (sources as { status: string }[]).filter((s) => s.status === "HEALTHY" || s.status === "WARNING").length;
  const pausedSources = (sources as { status: string }[]).filter((s) => s.status === "PAUSED" || s.status === "DISABLED").length;
  const blockedSources = (sources as { status: string }[]).filter((s) => s.status === "BLOCKED" || s.status === "RESTRICTED" || s.status === "FAILED").length;

  const schedulerLate = !lastSuccessfulTick || (now.getTime() - new Date(lastSuccessfulTick.startedAt).getTime()) > 60 * 60_000;

  const propertyCards = [
    { label: "Total Properties", value: totalProperties, href: "/admin/properties", tone: "text-brand" },
    { label: "Published", value: published, href: "/admin/properties?status=PUBLISHED", tone: "text-green-700" },
    { label: "Pending Review", value: pendingReview, href: "/admin/properties?status=PENDING_REVIEW", tone: "text-amber-600" },
    { label: "New Today", value: newToday, href: "/admin/properties", tone: "text-brand" },
    { label: "Upcoming Auctions", value: upcoming, href: "/admin/properties?auctionStatus=UPCOMING", tone: "text-blue-700" },
    { label: "Live / Today", value: live, href: "/admin/properties?auctionStatus=LIVE", tone: "text-green-700" },
    { label: "Completed", value: completed, href: "/admin/properties?auctionStatus=COMPLETED", tone: "text-gray-600" },
    { label: "Expired", value: expired, href: "/admin/properties?auctionStatus=EXPIRED", tone: "text-gray-400" },
    { label: "Duplicate Candidates", value: duplicateCandidates, href: "/admin/engine/duplicates", tone: "text-orange-600" },
    ...(master
      ? [
          { label: "Leads", value: leadsCount, href: "/admin/leads", tone: "text-gold-dark" },
          { label: "Registered Users", value: usersCount, href: "/admin/users", tone: "text-brand" },
        ]
      : []),
  ];

  const statusColors: Record<string, string> = {
    HEALTHY: "bg-green-50 text-green-700",
    WARNING: "bg-amber-50 text-amber-700",
    FAILED: "bg-red-50 text-red-700",
    DISABLED: "bg-gray-100 text-gray-600",
    RESTRICTED: "bg-gray-100 text-gray-500",
    BLOCKED: "bg-red-50 text-red-600",
    PAUSED: "bg-gray-100 text-gray-500",
  };

  const quick = [
    { href: "/admin/properties/new", label: "Add property" },
    { href: "/admin/localities", label: "Manage locations" },
    { href: "/admin/blog/new", label: "Write blog post" },
    ...(master ? [{ href: "/admin/admins", label: "Add admin" }] : []),
  ];

  function timeAgo(d: Date | null | undefined): string {
    if (!d) return "Never";
    const mins = Math.floor((now.getTime() - new Date(d).getTime()) / 60_000);
    if (mins < 2) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
          <p className="text-sm text-brand-muted">
            {master ? "Live snapshot of listings, leads, users and the data engine." : "Live snapshot of the listings on the site."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="text-xs font-medium bg-white border border-brand-border rounded-lg px-3 py-2 hover:border-brand hover:text-brand">
              {q.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Scheduler health alert */}
      {schedulerLate && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-700">
          <span className="font-semibold">⚠ Scheduler alert:</span>
          No successful ingestion in the last 60 minutes.{" "}
          <Link href="/admin/engine/history" className="underline font-medium">Check Run History</Link>
        </div>
      )}

      {/* Property cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
        {propertyCards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-white border border-brand-border rounded-xl p-4 hover:border-brand hover:shadow-sm transition">
            <div className={`text-3xl font-bold ${c.tone}`}>{c.value}</div>
            <div className="text-xs text-brand-muted mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      {/* Scheduler + AI + Ingestion stats row */}
      {master && (
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="text-xs text-brand-muted mb-2 font-semibold uppercase tracking-wide">Scheduler</div>
            <div className={`text-sm font-semibold mb-1 ${schedulerLate ? "text-red-600" : "text-green-700"}`}>
              {schedulerLate ? "⚠ Late" : "✓ Healthy"}
            </div>
            <div className="text-xs text-brand-muted">Last sync: {timeAgo(lastSuccessfulTick?.startedAt)}</div>
            <div className="text-xs text-brand-muted">Runs (24h): {runsLast24h}</div>
            <Link href="/admin/engine/history" className="text-xs text-brand mt-2 inline-block hover:underline">View history →</Link>
          </div>
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="text-xs text-brand-muted mb-2 font-semibold uppercase tracking-wide">Ingestion (7 days)</div>
            <div className="flex gap-4 mb-2">
              <div>
                <div className="text-2xl font-bold text-green-700">{successfulRuns7d}</div>
                <div className="text-xs text-brand-muted">Successful</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{failedRuns7d}</div>
                <div className="text-xs text-brand-muted">Failed</div>
              </div>
            </div>
            <Link href="/admin/engine/history" className="text-xs text-brand hover:underline">View run history →</Link>
          </div>
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="text-xs text-brand-muted mb-2 font-semibold uppercase tracking-wide">AI Token Budget</div>
            <div className={`text-2xl font-bold mb-1 ${aiPct >= 100 ? "text-red-600" : aiPct >= 80 ? "text-amber-600" : "text-green-700"}`}>
              {aiPct}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
              <div className={`h-1.5 rounded-full ${aiPct >= 100 ? "bg-red-500" : aiPct >= 80 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(aiPct, 100)}%` }} />
            </div>
            <div className="text-xs text-brand-muted">{aiTokensUsed.toLocaleString()} / {aiCap.toLocaleString()} tokens (24h)</div>
            <Link href="/admin/ai" className="text-xs text-brand mt-1 inline-block hover:underline">AI settings →</Link>
          </div>
        </div>
      )}

      <div className={`grid ${master ? "lg:grid-cols-2" : ""} gap-6 mb-8`}>
        {/* Recently added */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm flex justify-between items-center">
            <span>Recently added properties</span>
            <Link href="/admin/properties" className="text-xs text-brand font-medium">View all →</Link>
          </div>
          <ul>
            {recent.map((p) => (
              <li key={p.id} className="px-4 py-2.5 border-b border-brand-border last:border-0 flex items-center justify-between gap-3">
                <Link href={`/admin/properties/${p.id}/edit`} className="text-sm truncate hover:text-brand">{p.title}</Link>
                <span className="text-[11px] text-brand-muted shrink-0">{p.createdAt.toLocaleDateString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Upcoming auctions */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm flex justify-between items-center">
            <span>Upcoming auctions</span>
            <Link href="/admin/properties?auctionStatus=UPCOMING" className="text-xs text-brand font-medium">View all →</Link>
          </div>
          {recentAuctions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-brand-muted text-center">No upcoming auctions.</p>
          ) : (
            <ul>
              {recentAuctions.map((a) => (
                <li key={a.id} className="px-4 py-2.5 border-b border-brand-border last:border-0 flex items-center justify-between gap-3">
                  <Link href={`/admin/properties/${a.property.id}/edit`} className="text-sm truncate hover:text-brand">{a.property.title}</Link>
                  <span className="text-[11px] text-brand-muted shrink-0">
                    {a.auctionStart ? new Date(a.auctionStart).toLocaleDateString("en-IN") : "Date TBD"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Master: leads + source health */}
      {master && (
        <>
          <div className={`grid ${recentLeads.length > 0 ? "lg:grid-cols-2" : ""} gap-6 mb-8`}>
            {recentLeads.length > 0 && (
              <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm flex justify-between">
                  <span>Latest leads</span>
                  <Link href="/admin/leads" className="text-xs text-brand font-medium">View all</Link>
                </div>
                <ul>
                  {recentLeads.map((l) => (
                    <li key={l.id} className="px-4 py-2.5 border-b border-brand-border last:border-0 text-sm flex justify-between gap-3">
                      <span className="truncate">{(l as { name?: string }).name ?? "Unknown"}</span>
                      <span className="text-[11px] text-brand-muted shrink-0">{l.createdAt.toLocaleDateString("en-IN")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Source summary */}
            <div className="bg-white border border-brand-border rounded-xl p-4">
              <div className="text-xs text-brand-muted mb-3 font-semibold uppercase tracking-wide">Sources</div>
              <div className="flex gap-6 mb-4">
                <div>
                  <div className="text-2xl font-bold text-green-700">{activeSources}</div>
                  <div className="text-xs text-brand-muted">Active</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-500">{pausedSources}</div>
                  <div className="text-xs text-brand-muted">Paused</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{blockedSources}</div>
                  <div className="text-xs text-brand-muted">Blocked</div>
                </div>
              </div>
              <Link href="/admin/engine" className="text-xs text-brand hover:underline">Open Data Engine →</Link>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Source health</h2>
            <Link href="/admin/engine" className="text-xs text-brand font-medium">Open Data Engine →</Link>
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-brand-bg text-left text-xs text-brand-muted">
                <tr>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last successful sync</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-brand-muted">No sources registered yet.</td>
                  </tr>
                )}
                {(sources as { id: string; name: string; status: string; lastSuccessfulSync?: Date | null }[]).map((s) => (
                  <tr key={s.id} className="border-t border-brand-border">
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusColors[s.status] ?? ""}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-brand-muted">
                      {s.lastSuccessfulSync ? new Date(s.lastSuccessfulSync).toLocaleString("en-IN") : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
