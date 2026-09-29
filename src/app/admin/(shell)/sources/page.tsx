import { prisma } from "@/lib/db/prisma";
import { SOURCE_REGISTRY } from "@/data-sources/registry";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  HEALTHY: "bg-green-50 text-green-700",
  WARNING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  DISABLED: "bg-gray-100 text-gray-600",
  RESTRICTED: "bg-gray-100 text-gray-500",
  NOT_BUILT: "bg-gray-100 text-gray-500",
};

export default async function AdminSourcesPage() {
  const dbSources = await prisma.source.findMany({
    include: { _count: { select: { records: true, importJobs: true } } },
  });
  const dbByName = new Map(dbSources.map((s) => [s.name, s]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Sources</h1>
      <p className="text-sm text-brand-muted mb-5">
        Every candidate data source registered in code, its verified access status, and ingestion health once an
        adapter has actually run for it.
      </p>

      <div className="grid gap-4">
        {SOURCE_REGISTRY.map((reg) => {
          const db = dbByName.get(reg.name);
          const hasAdapter = reg.key === "bankauctions"; // only implemented adapter so far
          const displayStatus = db?.status ?? (hasAdapter ? "WARNING" : "NOT_BUILT");

          return (
            <div key={reg.key} className="bg-white border border-brand-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{reg.name}</div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[displayStatus] ?? ""}`}>
                  {db ? displayStatus : hasAdapter ? "NOT YET RUN" : "ADAPTER NOT BUILT"}
                </span>
              </div>
              <div className="text-xs text-brand-muted mb-2">{reg.baseUrl}</div>
              <p className="text-sm text-black/80 mb-3">{reg.accessNotes}</p>
              {db ? (
                <div className="flex gap-6 text-xs text-brand-muted">
                  <span>{db._count.records} source records</span>
                  <span>{db._count.importJobs} import jobs run</span>
                  <span>Last success: {db.lastSuccessfulSync ? new Date(db.lastSuccessfulSync).toLocaleString("en-IN") : "Never"}</span>
                </div>
              ) : (
                <p className="text-xs text-brand-muted">
                  {reg.accessStatus === "ALLOWED"
                    ? "Access verified, but no adapter has been built/run for this source yet."
                    : "Access is restricted or unverified — no automated fetching from this source."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
