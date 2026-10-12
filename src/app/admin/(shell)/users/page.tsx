import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { computePremium } from "@/lib/payments/premium";
import { makeNormal, makePremium, makeResetLink } from "./actions";

export const dynamic = "force-dynamic";

/** Everyone who registered on the public website (not the admin team). */
export default async function RegisteredUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; link?: string; for?: string }> }) {
  await requireMaster();
  const { q, link, for: linkFor } = await searchParams;
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};

  const [users, total, last7] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, email: true, name: true, role: true, createdAt: true, _count: { select: { savedProperties: true, alerts: true } } },
    }),
    prisma.user.count(),
    // eslint-disable-next-line react-hooks/purity -- server component, evaluated once per request
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ]);

  const rows = await prisma.payment.findMany({
    where: { email: { in: users.map((u) => u.email.toLowerCase()) }, status: { in: ["paid", "revoked", "refunded"] } },
    select: { email: true, status: true, createdAt: true, paidAt: true, planId: true, note: true },
    orderBy: { createdAt: "asc" },
  });
  const requested = await prisma.payment.findMany({ where: { status: "requested", email: { in: users.map((u) => u.email.toLowerCase()) } }, select: { email: true, planId: true, amount: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  const requestOf = new Map(requested.map((r) => [r.email ?? "", r]));
  const byEmail = new Map<string, typeof rows>();
  for (const r of rows) (byEmail.get(r.email ?? "") ?? byEmail.set(r.email ?? "", []).get(r.email ?? "")!).push(r);
  const now = new Date();

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Registered Users</h1>
      <p className="text-sm text-brand-muted mb-5">People who created an account on the website, newest first.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-brand-border rounded-xl p-4"><div className="text-2xl font-semibold text-brand">{total}</div><div className="text-xs text-brand-muted mt-1">Total users</div></div>
        <div className="bg-white border border-brand-border rounded-xl p-4"><div className="text-2xl font-semibold text-green-700">{last7}</div><div className="text-xs text-brand-muted mt-1">Joined in last 7 days</div></div>
      </div>

      {link && link.startsWith("http") && (
        <div className="mb-4 rounded-xl border border-gold bg-[#FFF8E6] p-4 text-sm">
          <div className="font-semibold text-brand mb-1">Password reset link for {linkFor}</div>
          <p className="text-xs text-brand-muted mb-2">Valid 24 hours, works once. Send it to the user yourself (it is not emailed from here).</p>
          <input readOnly value={link} className="w-full border border-brand-border rounded-lg px-3 py-2 text-xs bg-white" />
        </div>
      )}

      <form className="flex gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Search name or email…" className="border border-brand-border rounded-lg px-3 py-2 text-sm w-64" />
        <button className="border border-brand-border rounded-lg px-4 text-sm hover:bg-brand-bg">Search</button>
      </form>

      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5">Premium</th>
              <th className="px-4 py-2.5 text-right">Saved</th>
              <th className="px-4 py-2.5 text-right">Alerts</th>
              <th className="px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const p = computePremium(byEmail.get(u.email.toLowerCase()) ?? [], now);
              return (
              <tr key={u.id} className="border-t border-brand-border">
                <td className="px-4 py-2.5">{u.name ?? "—"}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{u.role}</span></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <form action={makeResetLink}><input type="hidden" name="userId" value={u.id} /><button className="text-xs border border-brand-border rounded px-2 py-1 hover:bg-brand-bg" title="Create a password reset link">Reset link</button></form>
                    {!p.premium && requestOf.get(u.email.toLowerCase()) && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">Requested {requestOf.get(u.email.toLowerCase())!.planId} · ₹{(requestOf.get(u.email.toLowerCase())!.amount / 100).toLocaleString("en-IN")}</span>
                    )}
                    {p.premium && p.until ? (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Premium until {p.until.toLocaleDateString("en-IN")}</span>
                        <form action={makeNormal}><input type="hidden" name="userId" value={u.id} /><button className="text-xs border border-brand-border rounded px-2 py-1 hover:bg-brand-bg">Make normal</button></form>
                      </>
                    ) : (
                      <form action={makePremium} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="days" defaultValue="90" className="text-xs border border-brand-border rounded px-1 py-1">
                          <option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option>
                        </select>
                        <button className="text-xs bg-brand text-white rounded px-2 py-1 hover:bg-brand-dark">Make Premium</button>
                      </form>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">{u._count.savedProperties}</td>
                <td className="px-4 py-2.5 text-right">{u._count.alerts}</td>
                <td className="px-4 py-2.5 text-brand-muted">{u.createdAt.toLocaleDateString("en-IN")}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-10 text-center text-sm text-brand-muted">No users yet.</div>}
      </div>
    </div>
  );
}
