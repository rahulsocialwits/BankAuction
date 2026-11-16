import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import EngineTabs from "@/components/admin/EngineTabs";
import SubmitButton from "@/components/admin/SubmitButton";
import { findDuplicateGroups } from "@/lib/pipeline/duplicates";
import { cleanObviousDuplicates, markDuplicates, restoreDuplicate } from "./actions";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "candidates" } = await searchParams;
  const groups = await findDuplicateGroups();
  const obvious = groups.filter((g) => g.similarity >= 0.6);

  // P2.8: load all DUPLICATE properties with their merge log for investigation
  const hiddenDups = view === "history"
    ? await prisma.property.findMany({
        where: { status: "DUPLICATE" },
        select: {
          id: true,
          slug: true,
          title: true,
          createdAt: true,
          changes: {
            where: { field: { in: ["dedup_merge", "dedup_restored", "dedup_not_same"] } },
            orderBy: { detectedAt: "desc" },
            select: { field: true, newValue: true, detectedAt: true },
            take: 5,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      })
    : [];

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />
      <p className="text-sm text-brand-muted mb-4">
        Properties from any source that share the same bank, reserve price and auction day. The oldest one is kept; the
        others are hidden as duplicates (nothing is erased, and imports never bring them back).
      </p>

      {/* View switcher */}
      <div className="flex gap-2 mb-5">
        <Link href="?view=candidates" className={`text-sm px-4 py-2 rounded-lg border transition-colors ${view !== "history" ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"}`}>
          Candidates ({groups.length})
        </Link>
        <Link href="?view=history" className={`text-sm px-4 py-2 rounded-lg border transition-colors ${view === "history" ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"}`}>
          P2.8 — Hidden duplicates & audit
        </Link>
        <Link href="/admin/duplicates" className="text-sm px-4 py-2 rounded-lg border border-brand-border text-brand-muted hover:border-brand ml-auto">
          Side-by-side review →
        </Link>
      </div>

      {view === "history" ? (
        <div>
          <p className="text-sm text-brand-muted mb-4">
            All {hiddenDups.length} properties currently hidden as DUPLICATE, with their merge/restore audit trail. Restore a falsely-merged listing to PENDING_REVIEW for human verification.
          </p>
          {hiddenDups.length === 0 ? (
            <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3">No hidden duplicates.</div>
          ) : (
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-bg text-xs text-brand-muted text-left">
                  <tr>
                    <th className="px-4 py-2.5">Property</th>
                    <th className="px-4 py-2.5">Merged</th>
                    <th className="px-4 py-2.5">Audit</th>
                    <th className="px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hiddenDups.map((p) => {
                    const mergeEvent = p.changes.find((c) => c.field === "dedup_merge");
                    const restoreEvent = p.changes.find((c) => c.field === "dedup_restored");
                    return (
                      <tr key={p.id} className="border-t border-brand-border hover:bg-brand-bg">
                        <td className="px-4 py-2.5">
                          <div className="font-medium line-clamp-1">{p.title}</div>
                          <div className="text-xs text-brand-muted">Added {p.createdAt.toLocaleDateString("en-IN")}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-brand-muted">
                          {mergeEvent ? (
                            <>
                              {mergeEvent.detectedAt.toLocaleDateString("en-IN")}<br />
                              kept: <Link href={`/admin/properties/${mergeEvent.newValue}/edit`} className="text-brand hover:underline">{mergeEvent.newValue?.slice(0, 8)}…</Link>
                            </>
                          ) : "no merge log"}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {restoreEvent && <span className="text-amber-600">Restored {restoreEvent.detectedAt.toLocaleDateString("en-IN")}</span>}
                          {!restoreEvent && !mergeEvent && <span className="text-brand-muted">auto-detected</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <Link href={`/admin/properties/${p.id}/edit`} className="text-xs border border-brand-border rounded px-2 py-1 hover:border-brand">Edit</Link>
                            <form action={restoreDuplicate}>
                              <input type="hidden" name="id" value={p.id} />
                              <SubmitButton className="text-xs border border-amber-400 text-amber-700 rounded px-2 py-1 hover:bg-amber-50">Restore</SubmitButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form action={cleanObviousDuplicates}>
          <SubmitButton className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark">
            Clean {obvious.length} obvious duplicate group{obvious.length === 1 ? "" : "s"}
          </SubmitButton>
        </form>
        <span className="text-xs text-brand-muted">&quot;Obvious&quot; = titles are at least 60% alike. Others need a manual look.</span>
      </div>

      {groups.length === 0 ? (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3">No duplicates found.</div>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <div key={g.key} className="bg-white border border-brand-border rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-xs text-brand-muted">
                  {g.reason} ·{" "}
                  <span className={g.similarity >= 0.6 ? "text-red-600 font-semibold" : "text-amber-700 font-semibold"}>
                    {Math.round(g.similarity * 100)}% title match
                  </span>
                </div>
                <form action={markDuplicates}>
                  {g.members.slice(1).map((m) => (
                    <input key={m.id} type="hidden" name="id" value={m.id} />
                  ))}
                  <SubmitButton className="text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">
                    Hide {g.members.length - 1} extra
                  </SubmitButton>
                </form>
              </div>
              <ul className="divide-y divide-brand-border text-sm">
                {g.members.map((m, i) => (
                  <li key={m.id} className="py-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium break-words">{m.title}</div>
                      <div className="text-xs text-brand-muted">
                        {m.source} · {m.status} · added {m.createdAt.toLocaleDateString("en-IN")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {i === 0 && <span className="text-green-700 font-semibold">Kept</span>}
                      <Link href={`/property/${m.slug}`} target="_blank" className="text-brand hover:underline">View ↗</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
