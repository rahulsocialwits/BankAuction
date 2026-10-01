import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";

export const dynamic = "force-dynamic";

/** Everyone who registered on the public website (not the admin team). */
export default async function RegisteredUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireMaster();
  const { q } = await searchParams;
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};

  const [users, total, last7] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, email: true, name: true, role: true, createdAt: true, _count: { select: { savedProperties: true, alerts: true } } },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ]);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Registered Users</h1>
      <p className="text-sm text-brand-muted mb-5">People who created an account on the website, newest first.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-brand-border rounded-xl p-4"><div className="text-2xl font-semibold text-brand">{total}</div><div className="text-xs text-brand-muted mt-1">Total users</div></div>
        <div className="bg-white border border-brand-border rounded-xl p-4"><div className="text-2xl font-semibold text-green-700">{last7}</div><div className="text-xs text-brand-muted mt-1">Joined in last 7 days</div></div>
      </div>

      <form className="flex gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Search name or email…" className="border border-brand-border rounded-lg px-3 py-2 text-sm w-64" />
        <button className="border border-brand-border rounded-lg px-4 text-sm hover:bg-brand-bg">Search</button>
      </form>

      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5 text-right">Saved</th>
              <th className="px-4 py-2.5 text-right">Alerts</th>
              <th className="px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-brand-border">
                <td className="px-4 py-2.5">{u.name ?? "—"}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{u.role}</span></td>
                <td className="px-4 py-2.5 text-right">{u._count.savedProperties}</td>
                <td className="px-4 py-2.5 text-right">{u._count.alerts}</td>
                <td className="px-4 py-2.5 text-brand-muted">{u.createdAt.toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-10 text-center text-sm text-brand-muted">No users yet.</div>}
      </div>
    </div>
  );
}
