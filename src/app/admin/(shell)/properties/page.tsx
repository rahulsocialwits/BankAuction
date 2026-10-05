import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PropertyStatus } from "@prisma/client";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { approveProperty, bulkRemoveProperties, removeProperty, restoreProperty, publishAllDrafts } from "./actions";
import { fixThinNow } from "../engine/actions";
import { countThin } from "@/lib/pipeline/thinFix";
import { ISSUES, propertyWhere } from "@/lib/admin/propertyFilter";
import { isMasterAdmin } from "@/lib/auth/adminAuth";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [
  ["All", "ALL"],
  ["Pending review", "PENDING_REVIEW"],
  ["Published", "PUBLISHED"],
  ["Draft", "DRAFT"],
  ["Duplicates", "DUPLICATE"],
  ["Removed", "REMOVED"],
];

const STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  PENDING_REVIEW: "bg-amber-50 text-amber-800",
  DRAFT: "bg-gray-100 text-gray-600",
  DUPLICATE: "bg-purple-50 text-purple-700",
  EXPIRED: "bg-gray-100 text-gray-500",
  REMOVED: "bg-red-50 text-red-700",
};

const small = "text-xs border border-brand-border rounded-lg px-2.5 py-1 hover:bg-brand-bg";

export default async function AdminPropertiesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; source?: string; bank?: string; issue?: string; bulk?: string; published?: string }> }) {
  const { status, q, source: srcF, bank: bankF, issue, bulk, published } = await searchParams;
  const master = await isMasterAdmin();
  // A normal admin never sees pipeline concepts (duplicates, sources); they only manage listings.
  const tabs = master ? TABS : TABS.filter(([, v]) => v !== "DUPLICATE");
  const active = status && status !== "ALL" && (master || status !== "DUPLICATE") ? status : "ALL";

  const where: Prisma.PropertyWhereInput = propertyWhere({ status: active, q, source: srcF, bank: bankF, issue, master });
  const qs = (o: Record<string, string | undefined>) => {
    const m = { status: active, q, source: srcF, bank: bankF, issue, ...o };
    return "?" + Object.entries(m).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
  };
  const [sources, banks] = master
    ? await Promise.all([
        prisma.auction.groupBy({ by: ["statusSource"], _count: { _all: true }, where: { statusSource: { not: null } }, orderBy: { _count: { statusSource: "desc" } } }),
        prisma.bank.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];
  const thin = master ? await countThin() : 0;
  const narrowed = !!(q || srcF || bankF || issue);

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 },
        sourceRecords: { include: { source: true }, take: 1 },
      },
      take: 100,
    }),
    prisma.property.count({ where }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Properties</h1>
          <p className="text-sm text-brand-muted mt-1">Edit, publish, hide or restore any listing — imported or added by hand.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {master && <form action={publishAllDrafts}><SubmitButton className="rounded-xl border border-green-600 bg-green-600 text-white px-4 py-2.5 text-sm font-semibold">Publish all drafts</SubmitButton></form>}
          <Link href="/admin/properties/new" className="rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-semibold text-center">+ Add property</Link>
        </div>
      </div>

      {thin > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><b>{thin}</b> website listing(s) have no reserve price (visitors see “Not Available”). Fix them automatically: each one’s own page is read again; a price found is filled in, otherwise the listing is hidden.</span>
          <form action={fixThinNow} className="ml-auto">
            <SubmitButton className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white">Fix or hide them now (60 at a time)</SubmitButton>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(([label, value]) => (
          <Link
            key={value}
            href={`/admin/properties${qs({ status: value })}`}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold border ${active === value ? "bg-brand text-white border-brand" : "bg-white border-brand-border text-brand-muted hover:border-brand"}`}
          >
            {label}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap gap-2">
          <input type="hidden" name="status" value={active} />
          <input name="q" defaultValue={q} placeholder="Search title or place…" className="border border-brand-border rounded-lg px-3 py-1.5 text-xs w-48" />
          {master && (
            <>
              <select name="source" defaultValue={srcF ?? ""} className="border border-brand-border rounded-lg px-2 py-1.5 text-xs max-w-[190px]">
                <option value="">All sources</option>
                {sources.map((s2) => <option key={s2.statusSource} value={s2.statusSource ?? ""}>{(s2.statusSource ?? "").replace(/^feed:/, "")} ({s2._count._all})</option>)}
              </select>
              <select name="bank" defaultValue={bankF ?? ""} className="border border-brand-border rounded-lg px-2 py-1.5 text-xs max-w-[190px]">
                <option value="">All banks</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select name="issue" defaultValue={issue ?? ""} className="border border-brand-border rounded-lg px-2 py-1.5 text-xs">
                <option value="">Any information</option>
                {ISSUES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          )}
          <button className={small}>Filter</button>
          {narrowed && <Link href={`/admin/properties?status=${active}`} className={small}>Clear</Link>}
        </form>
      </div>

      {bulk && {published && <div role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{published} draft listing(s) published.</div>}

      <div role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{bulk} listing(s) hidden (Removed). They can be restored one by one from the Removed tab.</div>}

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-brand-border text-xs text-brand-muted flex flex-wrap items-center gap-3">
          <span>Showing {properties.length} of {total}</span>
          {master && narrowed && active !== "REMOVED" && total > 0 && (
            <form action={bulkRemoveProperties} className="ml-auto">
              <input type="hidden" name="status" value={active} />
              <input type="hidden" name="q" value={q ?? ""} />
              <input type="hidden" name="source" value={srcF ?? ""} />
              <input type="hidden" name="bank" value={bankF ?? ""} />
              <input type="hidden" name="issue" value={issue ?? ""} />
              <ConfirmButton message={`Hide all ${total} listings that match this filter? (They move to Removed and are not re-imported.)`} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Delete all {total} filtered</ConfirmButton>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg text-brand-muted">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">{master ? "Bank / source" : "Bank"}</th>
                <th className="px-4 py-3 text-left">Auction</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const a = p.auctions[0];
                const source = p.sourceRecords[0]?.source.name ?? a?.statusSource ?? "Added manually";
                return (
                  <tr key={p.id} className="border-t border-brand-border align-top hover:bg-brand-bg/60">
                    <td className="px-4 py-3 min-w-[280px]">
                      <div className="font-semibold text-sm text-brand line-clamp-2">{p.title}</div>
                      <div className="text-[11px] text-brand-muted mt-0.5">{p.addressText ?? "Location unavailable"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a?.bank?.name ?? "—"}</div>
                      {master && <div className="text-brand-muted mt-0.5">{source}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium">{a?.reservePrice ? "₹" + Number(a.reservePrice).toLocaleString("en-IN") : "—"}</div>
                      <div className="text-brand-muted mt-0.5">{a?.auctionStart ? new Date(a.auctionStart).toLocaleDateString("en-IN") : "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${STYLES[p.status] ?? "bg-gray-100"}`}>{p.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {p.status === "PUBLISHED" && (
                          <Link href={`/property/${p.slug}`} target="_blank" className={small}>View</Link>
                        )}
                        <Link href={`/admin/properties/${p.id}/edit`} className={small}>Edit</Link>
                        {(p.status === "PENDING_REVIEW" || p.status === "DRAFT") && (
                          <form action={approveProperty}>
                            <input type="hidden" name="propertyId" value={p.id} />
                            <SubmitButton className={`${small} text-green-700`}>Publish</SubmitButton>
                          </form>
                        )}
                        {p.status === "REMOVED" || p.status === "DUPLICATE" ? (
                          <form action={restoreProperty}>
                            <input type="hidden" name="propertyId" value={p.id} />
                            <SubmitButton className={small}>Restore</SubmitButton>
                          </form>
                        ) : (
                          <form action={removeProperty}>
                            <input type="hidden" name="propertyId" value={p.id} />
                            <SubmitButton className={`${small} text-red-600`}>Delete</SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {properties.length === 0 && <div className="p-12 text-center text-sm text-brand-muted">No property records in this view.</div>}
        </div>
      </div>
    </div>
  );
}
