import { prisma } from "@/lib/db/prisma";
import EngineTabs from "@/components/admin/EngineTabs";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  ok: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
  blocked: "bg-red-50 text-red-700",
  skipped: "bg-gray-100 text-gray-600",
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const logs = await prisma.sourceRunLog.findMany({
    where: filter === "problems" ? { status: { in: ["error", "blocked"] } } : filter === "ticks" ? { kind: "cron" } : { kind: { notIn: ["cron", "claim", "ai-slot"] } },
    orderBy: { startedAt: "desc" },
    take: 150,
  });

  const tabs = [
    ["", "Source runs"],
    ["problems", "Problems only"],
    ["ticks", "Scheduler ticks"],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />
      <div className="flex gap-2 mb-4 text-xs">
        {tabs.map(([v, l]) => (
          <a
            key={v}
            href={v ? `/admin/engine/history?filter=${v}` : "/admin/engine/history"}
            className={`rounded-full px-3 py-1.5 border ${(filter ?? "") === v ? "bg-brand text-white border-brand" : "bg-white border-brand-border text-brand-muted"}`}
          >
            {l}
          </a>
        ))}
      </div>

      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-brand-bg text-brand-muted">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">New</th>
              <th className="px-3 py-2 text-right">Dup</th>
              <th className="px-3 py-2 text-right">Rejected</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-brand-border align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {l.startedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  <div className="text-brand-muted">{l.trigger} · {(l.durationMs / 1000).toFixed(1)}s</div>
                </td>
                <td className="px-3 py-2 font-medium">{l.source}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded font-semibold ${STATUS[l.status] ?? ""}`}>{l.status}</span></td>
                <td className="px-3 py-2 text-right">{l.created}</td>
                <td className="px-3 py-2 text-right">{l.duplicates}</td>
                <td className="px-3 py-2 text-right">{l.rejected}</td>
                <td className="px-3 py-2 text-right">{l.aiTokens || "—"}</td>
                <td className="px-3 py-2 text-brand-muted max-w-xs break-words">{l.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <div className="p-10 text-center text-sm text-brand-muted">No runs recorded yet. They appear here after the next scheduled or manual run.</div>}
      </div>
    </div>
  );
}
