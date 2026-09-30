import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { SOURCE_REGISTRY } from "@/data-sources/registry";
import SubmitButton from "@/components/admin/SubmitButton";
import { toggleBuiltIn, toggleFeedSource, runFeedSourceNow } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUILT_IN_NAME = "BankAuctions.in";

function ago(d: Date | null | undefined) {
  if (!d) return "Never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-IN");
}

function Badge({ tone, children }: { tone: "green" | "gray" | "red" | "amber"; children: React.ReactNode }) {
  const c = {
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c}`}>{children}</span>;
}

const btn = "text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg";

export default async function DataEnginePage() {
  const [builtIn, lastJob, feeds, published] = await Promise.all([
    prisma.source.findUnique({ where: { name: BUILT_IN_NAME } }),
    prisma.importJob.findFirst({ where: { source: { name: BUILT_IN_NAME } }, orderBy: { startedAt: "desc" } }),
    prisma.feedSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.property.count({ where: { status: "PUBLISHED" } }),
  ]);

  const builtInPaused = builtIn?.status === "DISABLED";
  const liveCount = (builtInPaused ? 0 : 1) + feeds.filter((f) => f.active).length;
  const pausedCount = (builtInPaused ? 1 : 0) + feeds.filter((f) => !f.active).length;
  const blocked = SOURCE_REGISTRY.filter((s) => s.key !== "bankauctions" && s.accessStatus !== "ALLOWED");

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <p className="text-sm text-brand-muted mb-6">
        Every source that feeds listings into the site. Pause a source to stop it from importing; resume whenever you
        want. Sources run automatically every 30–60 minutes.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Live sources", value: liveCount, tone: "text-green-700" },
          { label: "Paused", value: pausedCount, tone: "text-amber-700" },
          { label: "Not allowed", value: blocked.length, tone: "text-gray-500" },
          { label: "Published listings", value: published, tone: "text-brand" },
        ].map((t) => (
          <div key={t.label} className="bg-white border border-brand-border rounded-xl p-4">
            <div className={`text-2xl font-semibold ${t.tone}`}>{t.value}</div>
            <div className="text-xs text-brand-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-3">Active sources</h2>
      <div className="grid gap-3 mb-8">
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">BankAuctions.in <span className="text-xs font-normal text-brand-muted">· built-in crawler</span></div>
              <div className="text-xs text-brand-muted">https://bankauctions.in — sitemap, every 30 min</div>
            </div>
            <div className="flex items-center gap-2">
              {builtInPaused ? <Badge tone="gray">Paused</Badge> : <Badge tone="green">Live</Badge>}
              <form action={toggleBuiltIn}>
                <SubmitButton className={btn}>{builtInPaused ? "Resume" : "Pause"}</SubmitButton>
              </form>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-brand-muted">
            <span>Last successful sync: {ago(builtIn?.lastSuccessfulSync)}</span>
            {lastJob && (
              <span>
                Last run: {lastJob.newProperties} new · {lastJob.updatedProperties} updated · {lastJob.failures} failed
              </span>
            )}
          </div>
        </div>

        {feeds.map((f) => (
          <div key={f.id} className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{f.name} <span className="text-xs font-normal text-brand-muted">· link source</span></div>
                <div className="text-xs text-brand-muted break-all">{f.url}</div>
              </div>
              <div className="flex items-center gap-2">
                {f.active ? <Badge tone="green">Live</Badge> : <Badge tone="gray">Paused</Badge>}
                <form action={runFeedSourceNow}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className={btn}>Run now</SubmitButton>
                </form>
                <form action={toggleFeedSource}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className={btn}>{f.active ? "Pause" : "Resume"}</SubmitButton>
                </form>
              </div>
            </div>
            <div className="mt-3 text-xs text-brand-muted flex flex-wrap items-start gap-x-6 gap-y-1">
              <span>Last run: {ago(f.lastRunAt)}</span>
              {f.lastStatus && <Badge tone={f.lastStatus === "ok" ? "green" : "red"}>{f.lastStatus === "ok" ? "OK" : "Error"}</Badge>}
              {f.lastMessage && <span className="break-words">{f.lastMessage}</span>}
            </div>
          </div>
        ))}

        <Link href="/admin/feeds" className="text-sm text-brand font-medium hover:underline">
          + Add a link source (website, Google Sheet or CSV)
        </Link>
      </div>

      <h2 className="font-semibold mb-1">Not available</h2>
      <p className="text-xs text-brand-muted mb-3">
        These are never fetched automatically — robots.txt, terms of use or anti-bot protection do not allow it.
      </p>
      <div className="grid gap-2">
        {blocked.map((s) => (
          <div key={s.key} className="bg-white border border-brand-border rounded-xl p-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 max-w-2xl">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-brand-muted">{s.accessNotes}</div>
            </div>
            <Badge tone="gray">{s.accessStatus === "UNAVAILABLE" ? "Unavailable" : "Not allowed"}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
