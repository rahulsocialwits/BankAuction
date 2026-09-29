import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { approveProperty, rejectProperty } from "./actions";
import type { PropertyStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const TABS: { label: string; value: PropertyStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending Review", value: "PENDING_REVIEW" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
];

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-green-50 text-green-700",
  PENDING_REVIEW: "bg-amber-50 text-amber-700",
  DRAFT: "bg-gray-100 text-gray-600",
  DUPLICATE: "bg-purple-50 text-purple-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

export default async function AdminPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status && status !== "ALL" ? (status as PropertyStatus) : undefined;

  const properties = await prisma.property.findMany({
    where: filter ? { status: filter } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 },
      sourceRecords: { include: { source: true }, take: 1 },
    },
    take: 50,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Properties</h1>
      <p className="text-sm text-brand-muted mb-5">
        Records pulled by the ingestion pipeline. Clean records auto-publish; uncertain ones wait here for review.
      </p>

      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "ALL" ? "/admin/properties" : `/admin/properties?status=${t.value}`}
            className={`text-sm px-3 py-1.5 rounded-lg border ${
              (status ?? "ALL") === t.value ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {properties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brand-muted">
                  Nothing here.
                </td>
              </tr>
            )}
            {properties.map((p) => {
              const auction = p.auctions[0];
              const source = p.sourceRecords[0]?.source;
              return (
                <tr key={p.id} className="border-t border-brand-border align-top">
                  <td className="px-4 py-3 max-w-xs">{p.title}</td>
                  <td className="px-4 py-3">{auction?.bank?.name ?? "—"}</td>
                  <td className="px-4 py-3">{p.category ?? <em className="text-brand-muted">unclassified</em>}</td>
                  <td className="px-4 py-3">
                    {source && auction?.sourceUrl ? (
                      <a href={auction.sourceUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {source.name}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[p.status] ?? ""}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.status !== "PUBLISHED" && (
                        <form action={approveProperty}>
                          <input type="hidden" name="propertyId" value={p.id} />
                          <button type="submit" className="bg-brand text-white text-xs font-medium rounded-md px-3 py-1.5 hover:bg-brand-dark">
                            Approve
                          </button>
                        </form>
                      )}
                      {p.status !== "DRAFT" && (
                        <form action={rejectProperty}>
                          <input type="hidden" name="propertyId" value={p.id} />
                          <button type="submit" className="border border-brand-border text-xs font-medium rounded-md px-3 py-1.5 hover:border-red-400 hover:text-red-600">
                            Reject
                          </button>
                        </form>
                      )}
                      {p.status === "PUBLISHED" && (
                        <Link href={`/property/${p.slug}`} target="_blank" className="text-xs text-brand hover:underline">
                          View →
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
