import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getAiConfig } from "@/lib/ai/aiConfig";
import SubmitButton from "@/components/admin/SubmitButton";
import EngineTabs from "@/components/admin/EngineTabs";
import { toggleBuiltIn, toggleFeedSource, deleteFeedSource, importAllNow, importEverythingNow, pauseImportAll, pauseImportingEverything, importAllBuiltIn, pauseBuiltInImportAll } from "./actions";
import { POLICY_PREFIX } from "@/lib/fetch/httpStatus";
import { relabelLegacyMessage } from "@/data-sources/feeds/blockedHosts";
import { builtInImportAll } from "@/data-sources/bankauctions/adapter";
import { isAiFeed } from "@/data-sources/feeds/run";
import { webStateOf } from "@/data-sources/feeds/siteScan";
import { aiScheduleStatus, istLabel } from "@/lib/pipeline/aiSchedule";
import { schedulerHealth } from "@/lib/pipeline/schedulerHealth";

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

// Web-page link sources run on every 15-minute scheduler slot; Sheet / CSV links keep their hourly throttle.
function nextRun(last: Date | null | undefined, url: string, aiNext: Date) {
  const isAi = !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url) && !/\.csv(\?|$)/i.test(url);
  if (isAi) return istLabel(aiNext) + " (AI scan)";
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
  const [builtIn, lastJob, feedsRaw, published, pending, lastTick, lastRuns, tokens24, ai, aiSchedule] = await Promise.all([
    prisma.source.findUnique({ where: { name: BUILT_IN_NAME } }),
    prisma.sourceRunLog.findFirst({ where: { kind: "builtin" }, orderBy: { startedAt: "desc" } }),
    prisma.feedSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.property.count({ where: { status: "PUBLISHED" } }),
    prisma.property.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.sourceRunLog.findFirst({ where: { kind: "cron", status: "ok" }, orderBy: { startedAt: "desc" } }),
    prisma.sourceRunLog.findMany({ where: { startedAt: { gte: since24h }, kind: { not: "coverage-snapshot" } }, orderBy: { startedAt: "desc" }, take: 200 }),
    prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: since24h } }, _sum: { aiTokens: true, created: true } }),
    getAiConfig(),
    aiScheduleStatus(),
  ]);

  // rows saved before the wording fix blamed the website for our own do-not-fetch list: show them truthfully
  const feeds = feedsRaw.map((f) => ({ ...f, lastMessage: relabelLegacyMessage(f.url, f.lastMessage) }));
  const policyOff = (m?: string | null) => !!m?.startsWith(POLICY_PREFIX);
  const builtInPaused = builtIn?.status === "DISABLED";
  const builtInAll = await builtInImportAll().catch(() => false);
  const liveFeeds = feeds.filter((f) => f.active);
  const liveCount = (builtInPaused ? 0 : 1) + liveFeeds.length;
  const pausedCount = (builtInPaused ? 1 : 0) + feeds.filter((f) => !f.active).length;

  // Scheduler health: a SUCCESSFUL tick should arrive at least every 60 minutes (same rule as the alert endpoint).
  const sched = schedulerHealth(lastTick, new Date());
  const schedulerTone: Tone = sched.state === "never" ? "red" : sched.late ? "amber" : "green";

  // Problems: everything that needs a human, in one list.
  const problems: { title: string; detail: string; fix: string }[] = [];
  if (!ai.hasKey) problems.push({ title: "AI key missing", detail: "Website scanning is off.", fix: "Set AI_API_KEY in Vercel and redeploy." });
  else if (!ai.keyValid) problems.push({ title: "AI key invalid", detail: `The saved key has non-standard characters (${ai.keyHint}).`, fix: "Re-paste the real key in Vercel and redeploy." });
  if (!ai.enabled) problems.push({ title: "AI is switched off", detail: "Link sources that need AI will fail.", fix: "Turn it on in AI Admin." });
  if (sched.state === "never") problems.push({ title: "Scheduler has never run", detail: "No successful automatic run has been recorded.", fix: "Set up the 15-minute scheduler (see the card below)." });
  else if (sched.late) problems.push({ title: "Scheduler is late", detail: `The last successful automatic run was ${ago(lastTick!.startedAt)}.`, fix: "Check GitHub Actions or your cron-job.org job." });
  for (const f of feeds) {
    if (f.lastStatus === "error") {
      const silent = f.lastMessage?.startsWith("Site not responding");
      problems.push({
        title: `${f.name}: ${silent ? "site does not answer our crawler" : "last run failed"}`,
        detail: f.lastMessage ?? "",
        fix: policyOff(f.lastMessage)
          ? "This is NOT a refusal by the website. This project's own do-not-fetch list (src/data-sources/feeds/blockedHosts.ts) disables this address. Press Remove, or ask the project owner to change the list."
          : f.lastMessage?.startsWith("Blocked")
          ? "The website itself refused automated access (robots.txt, HTTP 401/403 or a verification page). Press Remove on the source below."
          : silent
            ? "Nothing is broken on your side: this bank's server ignores automated requests, and we never work around that. It is retried twice a day. For its data, paste the bank's public notice in Bulk Import, or ask the bank for a data feed."
            : "Press Run on the source below to try again.",
      });
    }
  }
  if (pending > 0) problems.push({ title: `${pending} properties still wait for review`, detail: "The AI reviews new listings automatically; these are the ones it was not sure about, so they are not on the site yet.", fix: "Open Properties → Pending review and publish or remove them (only the unsure ones land here)." });

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Live sources", value: liveCount, tone: "text-green-700" },
          { label: "Paused", value: pausedCount, tone: "text-amber-700" },
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
            <div className="text-brand-muted mb-1">Scheduler (every 15 min)</div>
            <Badge tone={schedulerTone}>{sched.state === "never" ? "Never ran" : sched.late ? "Late" : "Running"}</Badge>
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
            <div className="mt-1 text-brand-muted">{lastRuns.filter((r) => r.status === "error" || r.status === "blocked" || r.status === "policy_block").length} failed runs</div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">AI Scan Schedule</h2>
          <Badge tone={aiSchedule.windowOpen ? (aiSchedule.ranThisSlot ? "green" : "amber") : "gray"}>
            {aiSchedule.windowOpen ? (aiSchedule.ranThisSlot ? "AI slot ran" : "AI slot open") : "Waiting for the next slot"}
          </Badge>
        </div>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-brand-border p-3">
            <dt className="text-brand-muted mb-1">AI Scan Schedule</dt>
            <dd className="font-medium">{aiSchedule.slots.join(" · ")}</dd>
          </div>
          <div className="rounded-lg border border-brand-border p-3">
            <dt className="text-brand-muted mb-1">Next AI Scan</dt>
            <dd className="font-medium">{istLabel(aiSchedule.nextAt)}</dd>
          </div>
          <div className="rounded-lg border border-brand-border p-3">
            <dt className="text-brand-muted mb-1">Timezone · Frequency</dt>
            <dd className="font-medium">{aiSchedule.timezone} · every 15 minutes</dd>
          </div>
          <div className="rounded-lg border border-brand-border p-3">
            <dt className="text-brand-muted mb-1">Last AI slot</dt>
            <dd className="font-medium">{aiSchedule.lastRunAt ? istLabel(aiSchedule.lastRunAt) : "none yet"}</dd>
          </div>
        </dl>
        <ul className="mt-3 space-y-0.5 text-xs text-brand-muted">
          <li>• Content unchanged → AI skipped</li>
          <li>• Duplicate (same content already processed) → AI skipped</li>
          <li>• Run already active → AI skipped</li>
          <li>• Outside the schedule, only code runs (BankAuctions.in crawler, duplicate cleanup, rule-based review); no AI tokens are used.</li>
        </ul>
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

      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="font-semibold">Sources</h2>
        <div className="flex flex-wrap gap-2">
          <form action={importEverythingNow}>
            <SubmitButton className="text-xs bg-gold text-white font-semibold rounded-lg px-4 py-2 hover:bg-gold-dark">⚡ Import ALL properties from every website now</SubmitButton>
          </form>
          <form action={pauseImportingEverything}>
            <SubmitButton className="text-xs border border-brand-border bg-white font-semibold rounded-lg px-4 py-2 hover:bg-brand-bg">⏸ Pause importing all</SubmitButton>
          </form>
        </div>
      </div>
      <p className="text-xs text-brand-muted mb-3">
        Press <b>Run</b> once: the source starts now and then keeps running by itself, automatically on the scheduler, until you press <b>Pause</b>.
        There is no need to press anything again.
      </p>
      <div className="grid gap-3 mb-8">
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">BankAuctions.in <span className="text-xs font-normal text-brand-muted">· built-in crawler</span></div>
              <div className="text-xs text-brand-muted">https://bankauctions.in — sitemap, every 15 min</div>
            </div>
            <div className="flex items-center gap-2">
              {builtInPaused ? <Badge tone="gray">Paused</Badge> : <Badge tone="green">Live</Badge>}
              {builtInAll && <Badge tone="amber">Importing all…</Badge>}
              <form action={builtInAll ? pauseBuiltInImportAll : importAllBuiltIn}>
                <SubmitButton className={builtInAll ? "text-xs border border-brand-border bg-white font-semibold rounded-lg px-3 py-1.5 hover:bg-brand-bg" : "text-xs bg-gold text-white font-semibold rounded-lg px-3 py-1.5 hover:bg-gold-dark"}>{builtInAll ? "⏸ Pause importing" : "⚡ Import all now"}</SubmitButton>
              </form>
              <form action={toggleBuiltIn}>
                <SubmitButton className={builtInPaused ? "text-xs bg-brand text-white rounded-lg px-4 py-1.5 hover:bg-brand-dark" : btn}>{builtInPaused ? "Run" : "Pause"}</SubmitButton>
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
                ) : policyOff(f.lastMessage) ? (
                  <Badge tone="gray">Disabled by configuration</Badge>
                ) : f.lastMessage?.startsWith("Blocked") ? (
                  <Badge tone="red">Blocked</Badge>
                ) : (
                  <Badge tone="gray">Paused</Badge>
                )}
                {f.active && isAiFeed(f.url) && !f.lastMessage?.startsWith("Blocked") && !policyOff(f.lastMessage) && (
                  <form action={importAllNow}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className="text-xs bg-gold text-white font-semibold rounded-lg px-3 py-1.5 hover:bg-gold-dark">{webStateOf(f.sheetState).importAll ? "Importing all…" : "⚡ Import all now"}</SubmitButton>
                  </form>
                )}
                {f.active && isAiFeed(f.url) && webStateOf(f.sheetState).importAll && (
                  <form action={pauseImportAll}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className="text-xs border border-brand-border font-semibold rounded-lg px-3 py-1.5 hover:bg-brand-bg">⏸ Pause importing</SubmitButton>
                  </form>
                )}
                {!f.active && (f.lastMessage?.startsWith("Blocked") || policyOff(f.lastMessage)) ? (
                  // The site refuses automated access: running it again can never work, so the only useful action is removing it.
                  <form action={deleteFeedSource}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className="text-xs border border-red-200 text-red-600 rounded-lg px-4 py-1.5 hover:bg-red-50">Remove</SubmitButton>
                  </form>
                ) : (
                  <form action={toggleFeedSource}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className={f.active ? btn : "text-xs bg-brand text-white rounded-lg px-4 py-1.5 hover:bg-brand-dark"}>{f.active ? "Pause" : "Run"}</SubmitButton>
                  </form>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-brand-muted flex flex-wrap items-start gap-x-6 gap-y-1">
              <span>Last run: {ago(f.lastRunAt)}</span>
              {f.active && <span className="text-green-700">Next auto-run: {nextRun(f.lastRunAt, f.url, aiSchedule.nextAt)}</span>}
              {f.lastStatus && <Badge tone={f.lastStatus === "ok" ? "green" : "red"}>{f.lastStatus === "ok" ? "OK" : "Error"}</Badge>}
              {f.lastMessage && <span className="break-words">{f.lastMessage}</span>}
            </div>
          </div>
        ))}

        <Link href="/admin/feeds" className="text-sm text-brand font-medium hover:underline">
          + Add a link source (website, Google Sheet or CSV)
        </Link>
      </div>

      <section className="bg-white border border-brand-border rounded-xl p-4 text-xs text-brand-muted">
        <h2 className="font-semibold text-sm text-black mb-2">How the scheduler is set up</h2>
        <p className="mb-2">
          One URL runs every source: <code className="bg-brand-bg px-1 rounded">/api/cron/ingest?secret=&lt;CRON_SECRET&gt;</code>. Point any
          scheduler at it every 15 minutes (cron-job.org is the most dependable free option). GitHub Actions and the daily
          Vercel cron are backups. Every call shows up above as &quot;Last tick&quot;.
        </p>
        <p>
          Web-page link sources are eligible every 15 minutes, and a page that has not changed (or that another source
          already processed) costs no AI tokens. BankAuctions.in and Sheet/CSV links are not slowed down.
        </p>
      </section>
    </div>
  );
}
