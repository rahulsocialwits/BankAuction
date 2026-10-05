import { requireMaster } from "@/lib/auth/adminAuth";
import DemoRunner from "./DemoRunner";
import LiveView from "./LiveView";

export const dynamic = "force-dynamic";
// A deep scan visits several pages, then waits for the AI.
export const maxDuration = 300;

export default async function ScrapDemoPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string }> }) {
  await requireMaster();
  const sp = await searchParams;
  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand">AI Python Scrap — DEMO</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-800">DEMO MODE</span>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-brand-muted">Experimental property ingestion workflow: finds ONE property on a permitted public website and collects it in depth. Does not modify production data.</p>
      <div role="note" className="mb-6 max-w-3xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>DEMO MODE — Production data is not modified.</strong> Results live only on this screen for this run: nothing is saved, no property is
        created, and there is no import button. The scan stays on one domain, checks robots.txt before every request, and stops at anything the
        website refuses (HTTP 401/403, robots.txt, anti-bot or login walls); it never retries or works around them.
      </div>
      {sp.error && <div role="alert" className="mb-4 max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</div>}
      {sp.added && <div role="status" className="mb-4 max-w-3xl rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">“{sp.added}” is now a Live source and is importing every property of the website. Progress is shown below.</div>}
      <DemoRunner />
      <LiveView />
    </div>
  );
}
