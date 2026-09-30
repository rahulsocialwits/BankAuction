import Link from "next/link";
import EngineTabs from "@/components/admin/EngineTabs";
import SubmitButton from "@/components/admin/SubmitButton";
import { findDuplicateGroups } from "@/lib/pipeline/duplicates";
import { cleanObviousDuplicates, markDuplicates } from "./actions";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const groups = await findDuplicateGroups();
  const obvious = groups.filter((g) => g.similarity >= 0.6);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />
      <p className="text-sm text-brand-muted mb-4">
        Properties from any source that share the same bank, reserve price and auction day. The oldest one is kept; the
        others are hidden as duplicates (nothing is erased, and imports never bring them back).
      </p>

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
    </div>
  );
}
