import { prisma } from "@/lib/db/prisma";
import { getAdminSession } from "@/lib/auth/adminAuth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" });
}

function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default async function CorrectionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  const { id } = await params;

  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true },
  });
  if (!property) notFound();

  const changes = await prisma.propertyChange.findMany({
    where: { propertyId: id },
    include: { sourceRecord: { select: { sourceId: true } } },
    orderBy: { detectedAt: "desc" },
    take: 500,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/admin/properties" className="hover:text-brand">Properties</Link>
        {" / "}
        <Link href={`/admin/properties/${id}/edit`} className="hover:text-brand">{property.title ?? id}</Link>
        {" / "}
        <span>Change history</span>
      </nav>

      <h1 className="text-xl font-semibold mb-1">Change history</h1>
      <p className="text-sm text-brand-muted mb-5">
        {property.title && <span>{property.title} · </span>}
        <Link href={`/property/${property.slug}`} target="_blank" className="text-brand hover:underline">/property/{property.slug}</Link>
      </p>

      {changes.length === 0 ? (
        <p className="text-sm text-brand-muted py-8 text-center">No field changes recorded for this property.</p>
      ) : (
        <div className="border border-brand-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-brand-muted">
              <tr>
                <th className="text-left px-4 py-3">Field</th>
                <th className="text-left px-4 py-3">Old value</th>
                <th className="text-left px-4 py-3">New value</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Detected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {changes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-2.5 font-mono text-xs text-brand">{c.field}</td>
                  <td className="px-4 py-2.5 text-xs text-brand-muted max-w-[160px]">{truncate(c.oldValue)}</td>
                  <td className="px-4 py-2.5 text-xs max-w-[160px]">{truncate(c.newValue)}</td>
                  <td className="px-4 py-2.5 text-xs text-brand-muted">{c.sourceRecord?.sourceId ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-brand-muted whitespace-nowrap">{fmt(c.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <Link href={`/admin/properties/${id}/edit`} className="text-sm text-brand hover:underline">← Back to edit</Link>
      </div>
    </div>
  );
}
