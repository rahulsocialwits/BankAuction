import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import SubmitButton from "@/components/admin/SubmitButton";
import CopyButton from "@/components/admin/CopyButton";
import CreateApiKeyForm from "@/components/admin/CreateApiKeyForm";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/apiKeys";
import { SITE_URL } from "@/lib/seo";
import { createApiKey, deleteApiKey, toggleApiKey } from "./actions";

export const dynamic = "force-dynamic";

const ENDPOINTS = [
  { path: "/api/v1/properties", what: "List published properties (newest first)", params: "state, city, locality, category, bank (slug), q, status = active | completed | all, priceMin, priceMax, updatedSince, page, limit (max 50)" },
  { path: "/api/v1/properties/{slug}", what: "One property with description, legal schedule and details", params: "—" },
  { path: "/api/v1/banks", what: "Banks that have published listings, with counts", params: "—" },
  { path: "/api/v1/places", what: "States, cities and areas that have listings, with counts", params: "—" },
];

function ago(d: Date | null) {
  if (!d) return "Never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return d.toLocaleDateString("en-IN");
}

export default async function ApiAdminPage() {
  await requireMaster();
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  const total = keys.reduce((n, k) => n + k.requestCount, 0);
  const base = SITE_URL;

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">API</h1>
      <p className="text-sm text-brand-muted mb-6 max-w-3xl">
        Let another website, app or partner read our public listing data. Give each user their own key, so you can switch one off
        without affecting the others. Only the information visitors can already see is shared: borrower names, officer contacts
        and document links are never included.
      </p>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Create an API key</h2>
        <CreateApiKeyForm action={createApiKey} />
      </section>

      <section className="bg-white border border-brand-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Keys</h2>
          <span className="text-xs text-brand-muted">{keys.length} key{keys.length === 1 ? "" : "s"} · {total.toLocaleString("en-IN")} requests in total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-brand-bg text-left text-xs text-brand-muted">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Key</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Requests</th>
                <th className="px-4 py-2.5">Last used</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-brand-border align-top">
                  <td className="px-4 py-3"><div className="font-medium">{k.name}</div>{k.note && <div className="text-xs text-brand-muted">{k.note}</div>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded ${k.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{k.active ? "Active" : "Off"}</span></td>
                  <td className="px-4 py-3 text-right">{k.requestCount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-brand-muted">{ago(k.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-brand-muted">{k.createdAt.toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <form action={toggleApiKey}><input type="hidden" name="id" value={k.id} /><SubmitButton className="text-xs border border-brand-border rounded-lg px-3 py-1 hover:bg-brand-bg">{k.active ? "Switch off" : "Switch on"}</SubmitButton></form>
                      <form action={deleteApiKey}><input type="hidden" name="id" value={k.id} /><SubmitButton className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1 hover:bg-red-50">Delete</SubmitButton></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.length === 0 && <div className="p-10 text-center text-sm text-brand-muted">No keys yet. Create the first one above.</div>}
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5">
        <h2 className="font-semibold mb-1">How to use it (documentation)</h2>
        <p className="text-xs text-brand-muted mb-4">Share this with the person who will connect to the API.</p>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-1">Base address</div>
              <div className="flex items-center gap-2"><code className="bg-brand-bg rounded px-2 py-1 text-xs">{base}/api/v1</code><CopyButton path={`${base}/api/v1`} /></div>
            </div>
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-1">Sign in with the key</div>
              <p>Send it in every request, either as <code className="bg-brand-bg rounded px-1.5 py-0.5 text-xs">Authorization: Bearer YOUR_KEY</code> or as <code className="bg-brand-bg rounded px-1.5 py-0.5 text-xs">x-api-key: YOUR_KEY</code>. Use it from a server, never from public browser code.</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-1">Limits</div>
              <p>{RATE_LIMIT_PER_MINUTE} requests per minute per key (answer 429 above that), 50 results per page. Errors come back as <code className="bg-brand-bg rounded px-1.5 py-0.5 text-xs">{`{"error":{"code","message"}}`}</code> with 401 (bad key), 400 (bad filter) or 404.</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-2">Endpoints</div>
              <div className="space-y-2">
                {ENDPOINTS.map((e) => (
                  <div key={e.path} className="border border-brand-border rounded-lg p-3">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold bg-green-100 text-green-800 rounded px-1.5 py-0.5">GET</span><code className="text-xs break-all">{e.path}</code></div>
                    <div className="text-xs mt-1">{e.what}</div>
                    {e.params !== "—" && <div className="text-[11px] text-brand-muted mt-1">Filters: {e.params}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-1">Example request</div>
              <pre className="bg-[#0f1b30] text-white/90 text-xs rounded-xl p-4 overflow-x-auto">{`curl "${base}/api/v1/properties?state=Maharashtra&category=RESIDENTIAL&limit=5" \\
  -H "Authorization: Bearer YOUR_KEY"`}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-1">Example answer</div>
              <pre className="bg-[#0f1b30] text-white/90 text-xs rounded-xl p-4 overflow-x-auto">{`{
  "data": [
    {
      "id": "cm...",
      "slug": "flat-at-kurla-west-mumbai",
      "url": "${base}/property/flat-at-kurla-west-mumbai",
      "title": "Flat at Kurla West, Mumbai",
      "category": "RESIDENTIAL",
      "location": { "state": "Maharashtra", "city": "Mumbai",
                    "locality": "Kurla West", "address": "Mumbai" },
      "bank": { "name": "State Bank of India", "slug": "state-bank-of-india" },
      "auction": { "status": "UPCOMING", "reservePrice": 8500000,
                   "emd": 850000, "start": "2026-11-10T05:30:00.000Z",
                   "method": "E-Auction" },
      "updatedAt": "2026-10-01T08:00:00.000Z"
    }
  ],
  "page": 1, "limit": 5, "total": 78, "hasMore": true
}`}</pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
