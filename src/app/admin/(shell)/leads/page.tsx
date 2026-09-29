import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { property: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Leads</h1>
      <p className="text-sm text-brand-muted mb-5">Submissions from the contact form and property inquiry forms.</p>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Contact</th>
              <th className="px-4 py-2.5">Property</th>
              <th className="px-4 py-2.5">Message</th>
              <th className="px-4 py-2.5">Received</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brand-muted">No leads yet.</td>
              </tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-brand-border align-top">
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3 text-brand-muted">
                  {l.email && <div>{l.email}</div>}
                  {l.phone && <div>{l.phone}</div>}
                </td>
                <td className="px-4 py-3">{l.property?.title ?? <em className="text-brand-muted">General inquiry</em>}</td>
                <td className="px-4 py-3 max-w-xs text-brand-muted">{l.message}</td>
                <td className="px-4 py-3 text-brand-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
