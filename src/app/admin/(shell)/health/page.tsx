import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { classifySourceMessage, summarizeTicks } from "@/lib/health/runHealth";
import { budgetLevel, dailyCap } from "@/lib/ai/dailyBudget";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-IN");
const ago = (d: Date | null | undefined) => {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

// GREEN = all healthy, AMBER = needs attention / uncertain, RED = error / refused / blocked
const TONE: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  unchanged: "bg-amber-100 text-amber-700",
  zero_yield: "bg-amber-100 text-amber-700",
  unknown_permission: "bg-amber-100 text-amber-700",
  awaiting_authorization: "bg-amber-100 text-amber-700",
  refused: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
  off: "bg-gray-100 text-gray-500",
};
const BADGE_LABEL: Record<string, string> = {
  healthy: "GREEN",
  unchanged: "AMBER",
  zero_yield: "AMBER",
  unknown_permission: "AMBER",
  awaiting_authorization: "AMBER",
  refused: "RED",
  error: "RED",
  off: "GRAY",
};

/** One page for the data engine's health, built only from stored run logs and counts (nothing is measured by guessing). */
export default async function RunHealthPage() {
  await requireMaster();
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated once per request
  const since = new Date(Date.now() - 24 * 3600_000);
  const [ticks, sources, runs24, statuses, created24, coords, quality, noCity, premiumRows, perSourceRuns, latestRunPerSource, perSourceErrors] = await Promise.all([
    prisma.sourceRunLog.findMany({ where: { kind: "cron", startedAt: { gte: since } }, select: { startedAt: true, status: true, durationMs: true }, orderBy: { startedAt: "asc" } }),
    prisma.feedSource.findMany({ select: { name: true, url: true, active: true, lastStatus: true, lastRunAt: true, lastMessage: true }, orderBy: { name: "asc" } }),
    prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: since } }, _sum: { created: true, updated: true, duplicates: true, rejected: true, aiTokens: true } }),
    prisma.property.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.property.count({ where: { createdAt: { gte: since } } }),
    prisma.property.count({ where: { status: "PUBLISHED", latitude: { not: null } } }),
    prisma.propertyAttribute.groupBy({ by: ["value"], where: { key: "coord_quality", property: { status: "PUBLISHED" } }, _count: { _all: true } }),
    prisma.property.count({ where: { status: "PUBLISHED", OR: [{ geoCity: null }, { geoState: null }] } }),
    prisma.payment.count({ where: { status: "requested" } }),
    // Per-source 24h aggregate: rows new, total runs
    prisma.sourceRunLog.groupBy({
      by: ["source"],
      where: { startedAt: { gte: since } },
      _sum: { created: true, updated: true },
      _count: { _all: true },
    }),
    // Latest run per source (for cursorPage)
    prisma.sourceRunLog.findMany({
      where: { startedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
      orderBy: { startedAt: "desc" },
      select: { source: true, cursorPage: true, status: true, startedAt: true },
    }),
    // Per-source error run count in last 24h
    prisma.sourceRunLog.groupBy({
      by: ["source"],
      where: { startedAt: { gte: since }, status: "error" },
      _count: { _all: true },
    }),
  ]);
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated once per request
  const nowMs = Date.now();
  const t = summarizeTicks(ticks.map((x) => x.startedAt));
  const published = statuses.find((s) => s.status === "PUBLISHED")?._count._all ?? 0;
  const q = (v: string) => quality.find((x) => x.value === v)?._count._all ?? 0;
  const cap = dailyCap();
  const tokens = runs24._sum.aiTokens ?? 0;
  // Per-source 24h lookup maps (by source name, case-insensitive)
  const perSourceMap = new Map(perSourceRuns.map((r) => [r.source.toLowerCase(), r]));
  const perSourceErrMap = new Map(perSourceErrors.map((r) => [r.source.toLowerCase(), r._count._all]));
  // Latest run per source name
  const latestPerSource = new Map<string, typeof latestRunPerSource[0]>();
  for (const r of latestRunPerSource) {
    if (!latestPerSource.has(r.source.toLowerCase())) latestPerSource.set(r.source.toLowerCase(), r);
  }
  const rows = sources.map((s) => {
    const k = classifySourceMessage(s.active, s.lastStatus, s.lastMessage);
    const key = s.name.toLowerCase();
    const agg = perSourceMap.get(key);
    const latest = latestPerSource.get(key);
    const errors24 = perSourceErrMap.get(key) ?? 0;
    return { s, k, rows24: (agg?._sum.created ?? 0) + (agg?._sum.updated ?? 0), new24: agg?._sum.created ?? 0, runs24n: agg?._count._all ?? 0, cursorPage: latest?.cursorPage ?? null, errors24 };
  });
  const attention = rows.filter((r) => ["refused", "error", "unknown_permission", "zero_yield", "awaiting_authorization"].includes(r.k.kind)).length;

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Run health</h1>
      <p className="text-sm text-brand-muted mb-5">Scheduler, sources, counts, coordinates and AI use in one place. Everything below comes from stored run logs and the database.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card title="Last tick" value={ago(t.last)} note={`${t.count} ticks in 24 h`} bad={!t.last || nowMs - t.last.getTime() > 20 * 60000} />
        <Card title="Longest gap (24 h)" value={t.maxGapMin === null ? "-" : `${t.maxGapMin} min`} note={`${t.gapsOver20} gap(s) over 20 min`} bad={(t.maxGapMin ?? 0) > 20} />
        <Card title="Sources needing attention" value={String(attention)} note={`of ${sources.length} configured`} bad={attention > 0} />
        <Card title="Premium requests waiting" value={String(premiumRows)} note="Registered Users page" bad={false} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Last 24 hours (run logs)</h2>
          <dl className="text-sm space-y-1.5">
            <Row k="New records" v={num(runs24._sum.created ?? 0)} />
            <Row k="Updated" v={num(runs24._sum.updated ?? 0)} />
            <Row k="Duplicates skipped" v={num(runs24._sum.duplicates ?? 0)} />
            <Row k="Rejected" v={num(runs24._sum.rejected ?? 0)} />
            <Row k="Properties created (database)" v={num(created24)} />
            <Row k="AI tokens" v={cap ? `${num(tokens)} of ${num(cap)} (${budgetLevel(tokens, cap)})` : `${num(tokens)} (no daily cap set)`} />
          </dl>
          <p className="text-[11px] text-brand-muted mt-3">Imports run by hand from a script on a laptop do not write run logs, so they are not in these totals.</p>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Properties by status</h2>
          <dl className="text-sm space-y-1.5">
            {statuses.sort((a, b) => b._count._all - a._count._all).map((s) => <Row key={s.status} k={s.status} v={num(s._count._all)} />)}
            <Row k="Published without a verified city or state" v={num(noCity)} />
          </dl>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Map coordinates (published)</h2>
          <dl className="text-sm space-y-1.5">
            <Row k="With coordinates" v={`${num(coords)} of ${num(published)}`} />
            <Row k="Exact (from the notice)" v={num(Math.max(0, coords - q("pincode") - q("city_centroid")))} />
            <Row k="PIN code area" v={num(q("pincode"))} />
            <Row k="City centre (approximate)" v={num(q("city_centroid"))} />
            <Row k="Without coordinates" v={num(Math.max(0, published - coords))} />
          </dl>
        </section>
      </div>

      <section className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <h2 className="font-semibold text-sm px-5 pt-4">Sources</h2>
        <p className="text-xs text-brand-muted px-5 pb-2">GREEN = healthy last run · AMBER = needs attention · RED = error or refused · rows/new = last 24 h</p>
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-left text-xs text-brand-muted border-t border-brand-border">
            <tr>
              <th className="px-5 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 whitespace-nowrap">Last run</th>
              <th className="px-3 py-2 whitespace-nowrap">Rows / new (24 h)</th>
              <th className="px-3 py-2 whitespace-nowrap">Errors (24 h)</th>
              <th className="px-3 py-2 whitespace-nowrap">Cursor page</th>
              <th className="px-3 py-2">What happened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, k, rows24, new24, cursorPage, errors24 }) => (
              <tr key={s.name} className="border-t border-brand-border align-top">
                <td className="px-5 py-2.5">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[11px] text-brand-muted break-all">{s.url.slice(0, 60)}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${TONE[k.kind] ?? "bg-gray-100"}`}>
                    {BADGE_LABEL[k.kind] ?? "GRAY"} — {k.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-brand-muted whitespace-nowrap">{ago(s.lastRunAt)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {rows24 > 0 ? <span>{num(rows24)} / <span className="text-green-700 font-medium">{num(new24)}</span></span> : <span className="text-brand-muted">—</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {errors24 > 0 ? <span className="text-red-700 font-semibold">{errors24}</span> : <span className="text-brand-muted">0</span>}
                </td>
                <td className="px-3 py-2.5 text-brand-muted">
                  {cursorPage != null ? `p.${cursorPage}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-brand-muted">
                  {(s.lastMessage ?? "").replace(/\s+/g, " ").slice(0, 150)}
                  {k.action && <div className="mt-1 text-brand">{k.action}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ title, value, note, bad }: { title: string; value: string; note: string; bad: boolean }) {
  return (
    <div className="bg-white border border-brand-border rounded-xl p-4">
      <div className="text-xs text-brand-muted">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${bad ? "text-red-700" : "text-brand"}`}>{value}</div>
      <div className="text-[11px] text-brand-muted mt-1">{note}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-brand-muted">{k}</dt><dd className="font-medium text-right">{v}</dd></div>;
}
