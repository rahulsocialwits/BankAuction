import { prisma } from "@/lib/db/prisma";
import EngineTabs from "@/components/admin/EngineTabs";
import { overlapOf, pct, summarizeCoverage, type CoverageAuctionRow } from "@/lib/pipeline/coverage";
import { describeYield, isYieldProblem, overallYield, yieldStateOf, type YieldVerdict } from "@/lib/pipeline/zeroYield";

export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000; // far above today's size; the page says so if it ever truncates
const n = (v: number) => v.toLocaleString("en-IN");

const YIELD_STYLE: Record<YieldVerdict, string> = {
  PRODUCTIVE: "bg-green-50 text-green-700",
  EMPTY: "bg-gray-100 text-gray-600",
  ZERO_YIELD: "bg-red-50 text-red-700",
  DROPPED: "bg-red-50 text-red-700",
  ALL_REJECTED: "bg-orange-50 text-orange-700",
};

interface AuctionQueryRow {
  externalAuctionId: string | null;
  sourceUrl: string | null;
  status: string;
  auctionStart: Date | null;
  auctionEnd: Date | null;
  reservePrice: unknown;
  property: { status: string; addressText: string | null; geoCity: string | null };
}
interface RunGroupRow {
  source: string;
  _sum: { created: number | null; duplicates: number | null; rejected: number | null };
  _count: { _all: number };
}
interface FeedQueryRow {
  id: string;
  name: string;
  url: string;
  active: boolean;
  lastRunAt: Date | null;
  lastStatus: string | null;
  sheetState: string | null;
}

export default async function CoveragePage() {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 864e5);
  const [auctionsRaw, runsRaw, feedsRaw] = await Promise.all([
    prisma.auction.findMany({
      take: MAX_ROWS,
      select: { externalAuctionId: true, sourceUrl: true, status: true, auctionStart: true, auctionEnd: true, reservePrice: true, property: { select: { status: true, addressText: true, geoCity: true } } },
    }),
    prisma.sourceRunLog.groupBy({
      by: ["source"],
      where: { startedAt: { gte: since }, kind: { in: ["builtin", "feed", "csv"] }, status: "ok" },
      _sum: { created: true, duplicates: true, rejected: true },
      _count: { _all: true },
    }),
    prisma.feedSource.findMany({ select: { id: true, name: true, url: true, active: true, lastRunAt: true, lastStatus: true, sheetState: true }, orderBy: { name: "asc" } }),
  ]);

  // typed explicitly so the page type-checks the same with or without generated Prisma types
  const auctions = auctionsRaw as unknown as AuctionQueryRow[];
  const runs = runsRaw as unknown as RunGroupRow[];
  const feeds = feedsRaw as unknown as FeedQueryRow[];

  const rows: CoverageAuctionRow[] = auctions.map((a) => ({
    externalId: a.externalAuctionId,
    sourceUrl: a.sourceUrl,
    auctionStatus: a.status,
    auctionStart: a.auctionStart,
    auctionEnd: a.auctionEnd,
    reservePrice: a.reservePrice,
    propertyStatus: a.property.status,
    hasAddress: !!(a.property.addressText?.trim() || a.property.geoCity?.trim()),
  }));
  const { overall, bySource } = summarizeCoverage(rows, now);
  const truncated = auctions.length >= MAX_ROWS;

  const runRows = runs
    .map((r) => ({ source: r.source, runs: r._count._all, ...overlapOf([{ created: r._sum.created ?? 0, duplicates: r._sum.duplicates ?? 0, rejected: r._sum.rejected ?? 0 }]) }))
    .sort((a, b) => b.created - a.created || b.discovered - a.discovered);

  const feedRows = feeds
    .map((f) => ({ ...f, state: yieldStateOf(f.sheetState), verdict: overallYield(yieldStateOf(f.sheetState), now) }))
    .sort((a, b) => Number(isYieldProblem(b.verdict)) - Number(isYieldProblem(a.verdict)) || a.name.localeCompare(b.name));
  const problems = feedRows.filter((f) => f.active && isYieldProblem(f.verdict));

  const funnel: [string, number, string][] = [
    ["Total auction rounds", overall.total, "Every auction row in the database."],
    ["Duplicate", overall.duplicate, "Marked as a duplicate of another listing."],
    ["Removed", overall.removed, "Hidden by an admin or a safe clean-up."],
    ["Unique", overall.unique, "Total minus duplicates and removed."],
    ["Published", overall.published, "Unique and visible to visitors."],
    ["Current", overall.current, "Published and not over (or postponed)."],
    ["Stale", overall.stale, "Published and marked open, but the date passed more than a day ago."],
    ["Current unique actionable", overall.actionable, "Current, with reserve price, auction date and an address."],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />

      <div className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <div className="text-xs uppercase tracking-wide text-brand-muted">The number to grow</div>
        <div className="text-4xl font-semibold text-brand mt-1">{n(overall.actionable)}</div>
        <div className="text-sm text-brand-muted mt-1">current unique actionable auctions{overall.published > 0 && ` — ${pct(overall.actionable / overall.published)} of the ${n(overall.published)} published`}</div>
        {truncated && <div className="mt-2 text-xs text-orange-700">Only the first {n(MAX_ROWS)} auctions were counted.</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {funnel.map(([label, v, hint]) => (
            <div key={label} className="rounded-lg border border-brand-border p-3" title={hint}>
              <div className="text-xs text-brand-muted">{label}</div>
              <div className="text-xl font-semibold text-brand">{n(v)}</div>
              <div className="text-[11px] text-brand-muted mt-0.5">{hint}</div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-brand mb-1">Sources that return nothing</h2>
      <p className="text-xs text-brand-muted mb-3">
        A run can finish &quot;ok&quot; and still find no listings. These are the link sources that look wrong: never found anything, used to and stopped, or find listings that are all rejected.
      </p>
      {problems.length === 0 ? (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 mb-6">No active source is currently flagged. Sources are checked on every run; a new source needs a few runs over several hours before it can be flagged.</div>
      ) : (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 mb-4">{problems.length} active source(s) need a look: {problems.map((p) => p.name).join(", ")}.</div>
      )}
      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto mb-8">
        <table className="w-full text-xs">
          <thead className="bg-brand-bg text-brand-muted">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2 text-left">Yield check</th>
              <th className="px-3 py-2 text-left">What it means</th>
              <th className="px-3 py-2 text-left">Per channel (last listings found / empty runs in a row)</th>
            </tr>
          </thead>
          <tbody>
            {feedRows.map((f) => (
              <tr key={f.id} className="border-t border-brand-border align-top">
                <td className="px-3 py-2 font-medium">{f.name}</td>
                <td className="px-3 py-2">{f.active ? "yes" : "paused"}</td>
                <td className="px-3 py-2">{f.verdict ? <span className={`px-2 py-0.5 rounded font-semibold ${YIELD_STYLE[f.verdict]}`}>{f.verdict}</span> : <span className="text-brand-muted">not measured yet</span>}</td>
                <td className="px-3 py-2 text-brand-muted max-w-xs">{f.verdict ? describeYield(f.verdict) : "Measured from the next run."}</td>
                <td className="px-3 py-2 text-brand-muted">
                  {(["list", "site", "sheet"] as const).filter((c) => f.state[c]).map((c) => `${c}: ${f.state[c]!.lastDiscovered} found / ${f.state[c]!.zeroStreak} empty`).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {feedRows.length === 0 && <div className="p-8 text-center text-sm text-brand-muted">No link sources yet.</div>}
      </div>

      <h2 className="text-lg font-semibold text-brand mb-1">Who found our auctions</h2>
      <p className="text-xs text-brand-muted mb-3">
        Each auction is counted once, under the source that created it (the site in its source id or URL). Another source that later re-reads the same listing does not take credit. Auctions added by hand or by CSV appear under their own link or &quot;(manual / unknown)&quot;.
      </p>
      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto mb-8">
        <table className="w-full text-xs">
          <thead className="bg-brand-bg text-brand-muted">
            <tr>
              <th className="px-3 py-2 text-left">Found by</th>
              <th className="px-3 py-2 text-right">Auctions</th>
              <th className="px-3 py-2 text-right">Duplicate</th>
              <th className="px-3 py-2 text-right">Published</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">Stale</th>
              <th className="px-3 py-2 text-right">Actionable</th>
              <th className="px-3 py-2 text-right">Share of actionable</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map((s) => (
              <tr key={s.source} className="border-t border-brand-border">
                <td className="px-3 py-2 font-medium">{s.source}</td>
                <td className="px-3 py-2 text-right">{n(s.counts.total)}</td>
                <td className="px-3 py-2 text-right">{n(s.counts.duplicate)}</td>
                <td className="px-3 py-2 text-right">{n(s.counts.published)}</td>
                <td className="px-3 py-2 text-right">{n(s.counts.current)}</td>
                <td className="px-3 py-2 text-right">{n(s.counts.stale)}</td>
                <td className="px-3 py-2 text-right font-semibold">{n(s.counts.actionable)}</td>
                <td className="px-3 py-2 text-right">{pct(s.shareOfActionable, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bySource.length === 0 && <div className="p-8 text-center text-sm text-brand-muted">No auctions yet.</div>}
      </div>

      <h2 className="text-lg font-semibold text-brand mb-1">How much of what each source shows we already had (last 30 days)</h2>
      <p className="text-xs text-brand-muted mb-3">
        From the run history. &quot;Already had&quot; is a listing the source showed that matched an auction we held. A high share means the source adds little new; a low share means it is a real addition. Caution: sources are read repeatedly, so the same existing listing is counted again on each read; the figure is most meaningful for a source&apos;s first full pass.
      </p>
      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-brand-bg text-brand-muted">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">Runs</th>
              <th className="px-3 py-2 text-right">Valid listings seen</th>
              <th className="px-3 py-2 text-right">New to us</th>
              <th className="px-3 py-2 text-right">Already had</th>
              <th className="px-3 py-2 text-right">Rejected</th>
              <th className="px-3 py-2 text-right">New share</th>
              <th className="px-3 py-2 text-right">Overlap</th>
            </tr>
          </thead>
          <tbody>
            {runRows.map((r) => (
              <tr key={r.source} className="border-t border-brand-border">
                <td className="px-3 py-2 font-medium">{r.source}</td>
                <td className="px-3 py-2 text-right">{n(r.runs)}</td>
                <td className="px-3 py-2 text-right">{n(r.valid)}</td>
                <td className="px-3 py-2 text-right font-semibold">{n(r.created)}</td>
                <td className="px-3 py-2 text-right">{n(r.duplicates)}</td>
                <td className="px-3 py-2 text-right">{n(r.rejected)}</td>
                <td className="px-3 py-2 text-right">{pct(r.uniqueRatio, 1)}</td>
                <td className="px-3 py-2 text-right">{pct(r.overlapRatio, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runRows.length === 0 && <div className="p-8 text-center text-sm text-brand-muted">No runs in the last 30 days.</div>}
      </div>
    </div>
  );
}
