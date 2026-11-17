import { prisma } from "@/lib/db/prisma";
import { getAdminSession, requireMaster } from "@/lib/auth/adminAuth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { writeAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { property: { select: { id: true, slug: true, title: true } } },
  });
  if (!ticket) notFound();

  async function updateStatus(formData: FormData) {
    "use server";
    const status = formData.get("status") as string;
    const resolution = (formData.get("resolution") as string | null)?.trim() ?? null;
    const allowedStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"];
    if (!allowedStatuses.includes(status)) return;

    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if ((status === "RESOLVED" || status === "CLOSED") && !ticket.resolvedAt) {
      updates.resolvedAt = new Date();
      updates.resolvedBy = a.id;
    }
    if (resolution) updates.resolution = resolution;
    if (!ticket.firstResponseAt && status !== "OPEN") {
      updates.firstResponseAt = new Date();
    }

    await prisma.supportTicket.update({ where: { id }, data: updates as Parameters<typeof prisma.supportTicket.update>[0]["data"] });
    await writeAuditLog({
      action: "support_ticket.status_change",
      entityType: "SupportTicket",
      entityId: id,
      note: { status, resolution },
    });
    redirect(`/admin/support/${id}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/admin/support" className="hover:text-brand">Support</Link>
        {" / "}
        <span>#{id.slice(-6)}</span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <h1 className="text-xl font-semibold">{ticket.subject}</h1>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          ticket.status === "OPEN" ? "bg-red-100 text-red-700" :
          ticket.status === "IN_REVIEW" ? "bg-amber-100 text-amber-700" :
          ticket.status === "RESOLVED" ? "bg-green-100 text-green-700" :
          "bg-gray-100 text-gray-500"
        }`}>{ticket.status.replace("_", " ")}</span>
      </div>

      <div className="bg-white border border-brand-border rounded-2xl p-5 mb-5 space-y-3 text-sm">
        <div className="flex gap-2 text-xs text-brand-muted">
          <span>Received {fmt(ticket.createdAt)}</span>
          {ticket.firstResponseAt && <span>· First response {fmt(ticket.firstResponseAt)}</span>}
          {ticket.resolvedAt && <span>· Resolved {fmt(ticket.resolvedAt)}</span>}
        </div>
        <p className="text-xs text-brand-muted">Reporter: {ticket.reporterEmail ?? "Anonymous"}</p>
        {ticket.property && (
          <p className="text-xs">
            Property:{" "}
            <Link href={`/property/${ticket.property.slug}`} target="_blank" className="text-brand hover:underline">
              {ticket.property.title ?? ticket.property.slug}
            </Link>
            {" "}
            <Link href={`/admin/properties/${ticket.property.id}/edit`} className="text-brand-muted hover:text-brand">(edit)</Link>
          </p>
        )}
        {ticket.body && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">{ticket.body}</div>
        )}
        {ticket.resolution && (
          <div className="mt-3">
            <p className="text-xs font-medium text-brand-muted mb-1">Resolution note:</p>
            <div className="p-3 bg-green-50 rounded-lg text-sm whitespace-pre-wrap">{ticket.resolution}</div>
          </div>
        )}
      </div>

      {ticket.status !== "CLOSED" && (
        <form action={updateStatus} className="bg-white border border-brand-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Update ticket</h2>
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <select name="status" defaultValue={ticket.status} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Resolution note (optional)</label>
            <textarea name="resolution" rows={3} defaultValue={ticket.resolution ?? ""} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
          </div>
          <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Save</button>
        </form>
      )}
    </div>
  );
}
