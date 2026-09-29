import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  HEALTHY: "bg-green-50 text-green-700",
  WARNING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  DISABLED: "bg-gray-100 text-gray-600",
  RESTRICTED: "bg-gray-100 text-gray-500",
};

export default async function AdminSourcesPage() {
  const sources = await prisma.source.findMany({
    include: { _count: { select: { records: true, importJobs: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Sources</h1>
      <p className="text-sm text-brand-muted mb-5">
        Every candidate data source, its verified access status, and ingestion health.
      </p>

      <div className="grid gap-4">
        {sources.map((s) => (
          <div key={s.id} className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{s.name}</div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[s.status] ?? ""}`}>{s.status}</span>
            </div>
            <div className="text-xs text-brand-muted mb-2">{s.baseUrl}</div>
            <p className="text-sm text-black/80 mb-3">{s.accessNotes}</p>
            <div className="flex gap-6 text-xs text-brand-muted">
              <span>{s._count.records} source records</span>
              <span>{s._count.importJobs} import jobs run</span>
              <span>Last success: {s.lastSuccessfulSync ? new Date(s.lastSuccessfulSync).toLocaleString("en-IN") : "Never"}</span>
            </div>
          </div>
        ))}
        {sources.length === 0 && (
          <p className="text-brand-muted text-sm">No sources registered yet — run an ingestion job to seed this list.</p>
        )}
      </div>
    </div>
  );
}
