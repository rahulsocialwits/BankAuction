import { prisma } from "@/lib/db/prisma";
import { addFeed, toggleFeed, deleteFeed } from "./actions";

import SubmitButton from "@/components/admin/SubmitButton";
import EngineTabs from "@/components/admin/EngineTabs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function FeedsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const feeds = await prisma.feedSource.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />
      <h2 className="text-lg font-semibold mb-1">Link Sources</h2>
      <p className="text-sm text-brand-muted mb-6 max-w-2xl">
        Paste a link to a website page that lists auctions, a Google Sheet or a CSV file. The site re-checks it every
        hour and publishes new listings directly. Website pages are read with AI (only if the site&apos;s robots.txt allows
        it); Sheets and CSV files use the same columns as <a href="/admin/properties/import" className="underline">Bulk Import</a>.
        Duplicates are skipped by matching similar titles, and by bank + reserve price + auction date, across all
        sources. Only add sources you have the right to use.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">{error}</div>}

      <form action={addFeed} className="bg-white border border-brand-border rounded-xl p-5 max-w-2xl grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end mb-8">
        <div>
          <label className="block text-xs font-semibold mb-1">Source name</label>
          <input name="name" required placeholder="e.g. SBI partner sheet" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Website, Google Sheet or CSV link</label>
          <input name="url" type="url" required placeholder="https://..." className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-5 py-2 text-sm hover:bg-brand-dark">Add &amp; fetch</SubmitButton>
      </form>

      <p className="text-xs text-brand-muted mb-3">Press <b>Run</b> once — the source then runs by itself about every hour until you press <b>Pause</b>.</p>
      <div className="space-y-3">
        {feeds.length === 0 && <p className="text-sm text-brand-muted">No link sources yet.</p>}
        {feeds.map((f) => (
          <div key={f.id} className="bg-white border border-brand-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-brand flex items-center gap-2">
                {f.name}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                  {f.active ? "Running automatically" : "Paused"}
                </span>
              </div>
              <div className="text-xs text-brand-muted truncate">{f.url}</div>
              <div className={`text-xs mt-1 ${f.lastStatus === "error" ? "text-red-600" : "text-brand-muted"}`}>
                {f.lastRunAt ? `Last run ${f.lastRunAt.toLocaleString("en-IN")} — ${f.lastMessage}` : "Not run yet"}
                {f.lastMessage === "Fetching…" && " (refresh in a few seconds)"}
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <form action={toggleFeed}>
                <input type="hidden" name="id" value={f.id} />
                <SubmitButton className={f.active ? "border border-brand-border rounded-lg px-4 py-1.5 hover:bg-brand-bg" : "bg-brand text-white rounded-lg px-4 py-1.5 hover:bg-brand-dark"}>
                  {f.active ? "Pause" : "Run"}
                </SubmitButton>
              </form>
              <form action={deleteFeed}><input type="hidden" name="id" value={f.id} /><button className="border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">Delete</button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
