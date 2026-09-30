import { prisma } from "@/lib/db/prisma";
import { addFeed, toggleFeed, deleteFeed, runFeedNow } from "./actions";

import SubmitButton from "@/components/admin/SubmitButton";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function FeedsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const feeds = await prisma.feedSource.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Link Sources</h1>
      <p className="text-sm text-brand-muted mb-6 max-w-2xl">
        Paste a link to a CSV file or a Google Sheet (File → Share → Publish to web, or any share link). The site reads it
        every 30 minutes and adds new listings; duplicates are skipped. Use the same columns as{" "}
        <a href="/admin/properties/import" className="underline">Bulk Import</a>. Only add data you have the right to publish.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">{error}</div>}

      <form action={addFeed} className="bg-white border border-brand-border rounded-xl p-5 max-w-2xl grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end mb-8">
        <div>
          <label className="block text-xs font-semibold mb-1">Source name</label>
          <input name="name" required placeholder="e.g. SBI partner sheet" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">CSV / Google Sheet link</label>
          <input name="url" type="url" required placeholder="https://docs.google.com/spreadsheets/d/..." className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-5 py-2 text-sm hover:bg-brand-dark">Add &amp; fetch</SubmitButton>
      </form>

      <div className="space-y-3 max-w-4xl">
        {feeds.length === 0 && <p className="text-sm text-brand-muted">No link sources yet.</p>}
        {feeds.map((f) => (
          <div key={f.id} className="bg-white border border-brand-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-brand flex items-center gap-2">
                {f.name}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                  {f.active ? "Active" : "Paused"}
                </span>
              </div>
              <div className="text-xs text-brand-muted truncate">{f.url}</div>
              <div className={`text-xs mt-1 ${f.lastStatus === "error" ? "text-red-600" : "text-brand-muted"}`}>
                {f.lastRunAt ? `Last run ${f.lastRunAt.toLocaleString("en-IN")} — ${f.lastMessage}` : "Not run yet"}
                {f.lastMessage === "Fetching…" && " (refresh in a few seconds)"}
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <form action={runFeedNow}><input type="hidden" name="id" value={f.id} /><button className="border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">Run now</button></form>
              <form action={toggleFeed}><input type="hidden" name="id" value={f.id} /><button className="border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">{f.active ? "Pause" : "Resume"}</button></form>
              <form action={deleteFeed}><input type="hidden" name="id" value={f.id} /><button className="border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">Delete</button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
