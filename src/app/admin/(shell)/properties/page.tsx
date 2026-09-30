import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PropertyStatus } from "@prisma/client";
import SubmitButton from "@/components/admin/SubmitButton";
import { approveProperty, removeProperty, restoreProperty } from "./actions";

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

export default async function AdminPropertiesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams;
  const active = status && status !== "ALL" ? status : "ALL";

  const where: Prisma.PropertyWhereInput = {
    // "All" hides duplicates and removed items so they never clutter the working list.
    status: active === "ALL" ? { notIn: ["DUPLICATE", "REMOVED"] } : (active as PropertyStatus),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { addressText: { contains: q, mode: "insensitive" } }] } : {}),
  };

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
        <Link href="/admin/properties/new" className="rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-semibold text-center">+ Add property</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([label, value]) => (
          <Link
            key={value}
            href={`/admin/properties?status=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold border ${active === value ? "bg-brand text-white border-brand" : "bg-white border-brand-border text-brand-muted hover:border-brand"}`}
          >
            {label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={active} />
          <input name="q" defaultValue={q} placeholder="Search title or place…" className="border border-brand-border rounded-lg px-3 py-1.5 text-xs w-48" />
          <button className={small}>Search</button>
        </form>
      </div>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-brand-border text-xs text-brand-muted">
          Showing {properties.length} of {total}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg text-brand-muted">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Bank / source</th>
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
                      <div className="text-brand-muted mt-0.5">{source}</div>
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
