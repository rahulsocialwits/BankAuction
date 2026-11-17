import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function fmt(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" });
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string; entity?: string }> }) {
  await requireMaster();
  const { page: pageParam, action: actionFilter, entity: entityFilter } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = {
    ...(actionFilter ? { action: { startsWith: actionFilter } } : {}),
    ...(entityFilter ? { entityType: entityFilter } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entity", entityFilter);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <span className="text-sm text-brand-muted">{total.toLocaleString("en-IN")} entries</span>
      </div>

      <form className="flex flex-wrap gap-3 mb-5 text-sm">
        <input name="action" defaultValue={actionFilter} placeholder="Filter by action prefix…" className="border border-brand-border rounded-lg px-3 py-1.5 text-sm" />
        <input name="entity" defaultValue={entityFilter} placeholder="Filter by entity type…" className="border border-brand-border rounded-lg px-3 py-1.5 text-sm" />
        <button type="submit" className="bg-brand text-white px-4 py-1.5 rounded-lg text-sm">Filter</button>
        {(actionFilter || entityFilter) && <Link href="/admin/audit" className="px-4 py-1.5 rounded-lg border border-brand-border text-sm">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <p className="text-brand-muted text-sm py-8 text-center">No audit entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-border">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg text-brand-muted text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Time (IST)</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Entity</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg/50">
                  <td className="px-4 py-2 whitespace-nowrap text-brand-muted">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-2 text-brand-muted">{r.actorEmail ?? r.actorId ?? "system"}</td>
                  <td className="px-4 py-2 font-mono text-brand">{r.action}</td>
                  <td className="px-4 py-2 text-brand-muted">
                    {r.entityType && <span>{r.entityType}</span>}
                    {r.entityId && <span className="ml-1 opacity-60">{r.entityId.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-2 text-brand-muted max-w-xs truncate">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-5 flex gap-2 text-sm">
          {page > 1 && <Link href={qs(page - 1)} className="px-4 py-2 border border-brand-border rounded-lg hover:border-brand">← Prev</Link>}
          <span className="px-4 py-2 text-brand-muted">Page {page} of {totalPages}</span>
          {page < totalPages && <Link href={qs(page + 1)} className="px-4 py-2 border border-brand-border rounded-lg hover:border-brand">Next →</Link>}
        </nav>
      )}
    </div>
  );
}
