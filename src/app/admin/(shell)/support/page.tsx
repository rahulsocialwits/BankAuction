import { prisma } from "@/lib/db/prisma";
import { getAdminSession } from "@/lib/auth/adminAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<TicketStatus, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

function fmt(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  const { status: statusFilter, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = statusFilter && ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"].includes(statusFilter)
    ? { status: statusFilter as TicketStatus }
    : { status: { in: ["OPEN", "IN_REVIEW"] as TicketStatus[] } };

  const [tickets, total, openCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: { property: { select: { slug: true, title: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Support tickets</h1>
          {openCount > 0 && <p className="text-sm text-red-600 mt-0.5">{openCount} open ticket{openCount !== 1 ? "s" : ""} need attention</p>}
        </div>
      </div>

      <div className="flex gap-2 mb-5 text-sm">
        {[
          { label: "Open + In review", value: "" },
          { label: "Open", value: "OPEN" },
          { label: "In review", value: "IN_REVIEW" },
          { label: "Resolved", value: "RESOLVED" },
          { label: "Closed", value: "CLOSED" },
        ].map(({ label, value }) => (
          <Link
            key={value}
            href={`/admin/support${value ? `?status=${value}` : ""}`}
            className={`px-3 py-1.5 rounded-lg border text-xs ${(!statusFilter && value === "") || statusFilter === value ? "bg-brand text-white border-brand" : "border-brand-border text-brand-muted hover:border-brand"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-brand-muted py-8 text-center">No tickets in this view.</p>
      ) : (
        <div className="border border-brand-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-brand-muted">
              <tr>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Property</th>
                <th className="text-left px-4 py-3">Reporter</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/support/${t.id}`} className="font-medium text-brand hover:underline">
                      {t.subject}
                    </Link>
                    {t.body && <p className="text-xs text-brand-muted mt-0.5 line-clamp-1">{t.body}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.property ? (
                      <Link href={`/property/${t.property.slug}`} target="_blank" className="text-brand hover:underline">
                        {t.property.title ?? t.property.slug}
                      </Link>
                    ) : (
                      <span className="text-brand-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-muted">{t.reporterEmail ?? "Anonymous"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-muted whitespace-nowrap">{fmt(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 text-xs">
          {page > 1 && <Link href={`/admin/support?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`} className="px-3 py-1.5 rounded border border-brand-border hover:border-brand">← Prev</Link>}
          <span className="px-3 py-1.5 text-brand-muted">Page {page} / {totalPages}</span>
          {page < totalPages && <Link href={`/admin/support?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`} className="px-3 py-1.5 rounded border border-brand-border hover:border-brand">Next →</Link>}
        </div>
      )}
    </div>
  );
}
