import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { SOURCE_REGISTRY } from "@/data-sources/registry";
import { getAiConfig } from "@/lib/ai/aiConfig";
import SubmitButton from "@/components/admin/SubmitButton";
import EngineTabs from "@/components/admin/EngineTabs";
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

// Link sources auto-run about once an hour; the next scheduler tick after that picks them up.
function nextRun(last: Date | null | undefined) {
  if (!last) return "on the next tick";
  const mins = Math.round((last.getTime() + 55 * 60000 - Date.now()) / 60000);
  return mins <= 0 ? "on the next tick (within ~30 min)" : `in about ${mins} min`;
}

type Tone = "green" | "gray" | "red" | "amber";
function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const c = {
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap ${c}`}>{children}</span>;
}

const btn = "text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg";

export default async function DataEnginePage() {
  const since24h = new Date(Date.now() - 864e5);
  const [builtIn, lastJob, feeds, published, pending, lastTick, lastRuns, tokens24, ai] = await Promise.all([
    prisma.source.findUnique({ where: { name: BUILT_IN_NAME } }),
    prisma.sourceRunLog.findFirst({ where: { kind: "builtin" }, orderBy: { startedAt: "desc" } }),
    prisma.feedSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.property.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.sourceRunLog.findFirst({ where: { kind: "cron" }, orderBy: { startedAt: "desc" } }),
    prisma.sourceRunLog.findMany({ where: { startedAt: { gte: since24h } }, orderBy: { startedAt: "desc" }, take: 200 }),
    prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: since24h } }, _sum: { aiTokens: true, created: true } }),
    getAiConfig(),
  ]);

  const builtInPaused = builtIn?.status === "DISABLED";
  const liveFeeds = feeds.filter((f) => f.active);
  const liveCount = (builtInPaused ? 0 : 1) + liveFeeds.length;
  const pausedCount = (builtInPaused ? 1 : 0) + feeds.filter((f) => !f.active).length;
  const blocked = SOURCE_REGISTRY.filter((s) => s.key !== "bankauctions" && s.accessStatus !== "ALLOWED");

  // Scheduler health: a tick should arrive at least every ~90 minutes.
  const tickAgeMin = lastTick ? (Date.now() - lastTick.startedAt.getTime()) / 60000 : null;
  const schedulerTone: Tone = tickAgeMin === null ? "red" : tickAgeMin > 90 ? "amber" : "green";

  // Problems: everything that needs a human, in one list.
  const problems: { title: string; detail: string; fix: string }[] = [];
  if (!ai.hasKey) problems.push({ title: "AI key missing", detail: "Website scanning is off.", fix: "Set AI_API_KEY in Vercel and redeploy." });
  else if (!ai.keyValid) problems.push({ title: "AI key invalid", detail: `The saved key has non-standard characters (${ai.keyHint}).`, fix: "Re-paste the real key in Vercel and redeploy." });
  if (!ai.enabled) problems.push({ title: "AI is switched off", detail: "Link sources that need AI will fail.", fix: "Turn it on in AI Admin." });
  if (tickAgeMin === null) problems.push({ title: "Scheduler has never run", detail: "No automatic run has been recorded.", fix: "Set up a 30-minute scheduler (see the card below)." });
  else if (tickAgeMin > 90) problems.push({ title: "Scheduler is late", detail: `Last automatic run was ${ago(lastTick!.startedAt)}.`, fix: "Check GitHub Actions or your cron-job.org job." });
  for (const f of feeds) {
    if (f.lastStatus === "error") problems.push({ title: `${f.name}: last run failed`, detail: f.lastMessage ?? "", fix: f.lastMessage?.startsWith("Blocked") ? "The site does not allow automated access. Delete this source." : "Fix the cause and press Run now." });
  }
  if (pending > 0) problems.push({ title: `${pending} properties wait for review`, detail: "They are not visible on the site yet.", fix: "Open Properties → Pending review and publish or remove them." });

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Live sources", value: liveCount, tone: "text-green-700" },
          { label: "Paused", value: pausedCount, tone: "text-amber-700" },
          { label: "Not allowed", value: blocked.length, tone: "text-gray-500" },
          { label: "Published", value: published, tone: "text-brand" },
          { label: "AI tokens (24h)", value: (tokens24._sum.aiTokens ?? 0).toLocaleString("en-IN"), tone: "text-brand" },
        ].map((t) => (
          <div key={t.label} className="bg-white border border-brand-border rounded-xl p-4">
            <div className={`text-2xl font-semibold ${t.tone}`}>{t.value}</div>
            <div className="text-xs text-brand-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      <section className="bg-white border border-brand-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">Health</h2>
          <Link href="/admin/ai" className="text-xs text-brand hover:underline">AI Admin →</Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-brand-border p-3">
            <div className="text-brand-muted mb-1">Scheduler (every 30 min)</div>
            <Badge tone={schedulerTone}>{tickAgeMin === null ? "Never ran" : tickAgeMin > 90 ? "Late" : "Running"}</Badge>
            <div className="mt-2 text-brand-muted">
              Last tick: {ago(lastTick?.startedAt)}
              {lastTick?.message && <div className="mt-0.5">{lastTick.message}</div>}
            </div>
          </div>
          <div className="rounded-lg border border-brand-border p-3">
            <div className="text-brand-muted mb-1">AI (Relay Models)</div>
            <Badge tone={ai.enabled && ai.keyValid ? "green" : "red"}>{!ai.enabled ? "Off" : ai.keyValid ? "Ready" : "Key problem"}</Badge>
            <div className="mt-2 text-brand-muted break-words">Model: {ai.model}</div>
          </div>
          <div className="rounded-lg border border-brand-border p-3">
            <div className="text-brand-muted mb-1">Last 24 hours</div>
            <div className="font-semibold text-sm">{tokens24._sum.created ?? 0} new listings</div>
            <div className="mt-1 text-brand-muted">{lastRuns.filter((r) => r.status === "error" || r.status === "blocked").length} failed runs</div>
          </div>
        </div>
      </section>

      <h2 className="font-semibold mb-2">Needs attention {problems.length > 0 && <span className="text-red-600">({problems.length})</span>}</h2>
      {problems.length === 0 ? (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 mb-6">Everything is running normally.</div>
      ) : (
        <div className="grid gap-2 mb-6">
          {problems.map((p, i) => (
            <div key={i} className="bg-white border border-red-200 rounded-xl p-3">
              <div className="text-sm font-medium text-red-700">{p.title}</div>
              {p.detail && <div className="text-xs text-brand-muted mt-0.5 break-words">{p.detail}</div>}
              <div className="text-xs mt-1"><span className="font-semibold">Fix:</span> {p.fix}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-semibold mb-1">Sources</h2>
      <p className="text-xs text-brand-muted mb-3">
        <b>Live</b> means the source runs by itself, automatically, about every hour. You never need to press Run now —
        it only forces an immediate extra run. Press <b>Pause</b> to stop a source; <b>Resume</b> puts it back on automatic.
      </p>
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
                Last run ({ago(lastJob.startedAt)}): {lastJob.created} new · {lastJob.updated} updated · {lastJob.rejected} failed
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
                {f.active ? (
                  <Badge tone="green">Live</Badge>
                ) : f.lastMessage?.startsWith("Blocked") ? (
                  <Badge tone="red">Blocked</Badge>
                ) : (
                  <Badge tone="gray">Paused</Badge>
                )}
                <form action={runFeedSourceNow}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className={btn}>Run extra now</SubmitButton>
                </form>
                <form action={toggleFeedSource}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className={btn}>{f.active ? "Pause" : "Resume"}</SubmitButton>
                </form>
              </div>
            </div>
            <div className="mt-3 text-xs text-brand-muted flex flex-wrap items-start gap-x-6 gap-y-1">
              <span>Last run: {ago(f.lastRunAt)}</span>
              {f.active && <span className="text-green-700">Next auto-run: {nextRun(f.lastRunAt)}</span>}
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
      <div className="grid gap-2 mb-8">
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

      <section className="bg-white border border-brand-border rounded-xl p-4 text-xs text-brand-muted">
        <h2 className="font-semibold text-sm text-black mb-2">How the scheduler is set up</h2>
        <p className="mb-2">
          One URL runs every source: <code className="bg-brand-bg px-1 rounded">/api/cron/ingest?secret=&lt;CRON_SECRET&gt;</code>. Point any
          scheduler at it every 30 minutes (cron-job.org is the most dependable free option). GitHub Actions and the daily
          Vercel cron are backups. Every call shows up above as &quot;Last tick&quot;.
        </p>
        <p>Link sources are throttled to one scan per hour each, and a page that has not changed costs no AI tokens.</p>
      </section>
    </div>
  );
}
