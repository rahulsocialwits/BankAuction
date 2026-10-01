import { prisma } from "@/lib/db/prisma";
import { createAdmin, deleteAdmin, toggleAdmin } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  password: "Password must be at least 8 characters.",
  exists: "An admin with that email already exists.",
};

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const { error, created } = await searchParams;
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Admin Team</h1>
      <p className="text-sm text-brand-muted mb-6 max-w-3xl">
        Two kinds of login. <b>Admin</b> can use Dashboard, Properties, Add Property, Blog and Locations only, and never sees where
        listings come from. <b>Master</b> can open everything. The master password (sign in with no email) is always a Master login.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">{ERRORS[error] ?? "Something went wrong."}</div>}
      {created && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">Admin created.</div>}

      <form action={createAdmin} className="bg-white border border-brand-border rounded-xl p-5 mb-8 grid sm:grid-cols-5 gap-3 items-end max-w-4xl">
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input name="name" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input name="email" type="email" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Password (min 8)</label>
          <input name="password" type="password" required minLength={8} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Role</label>
          <select name="role" defaultValue="ADMIN" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="ADMIN">Admin (content only)</option>
            <option value="MASTER">Master (everything)</option>
          </select>
        </div>
        <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-brand-dark">Create</button>
      </form>

      <div className="bg-white border border-brand-border rounded-xl overflow-hidden max-w-4xl">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-muted">No team admins yet — only the master password is active.</td></tr>
            )}
            {admins.map((a) => (
              <tr key={a.id} className="border-t border-brand-border">
                <td className="px-4 py-2.5">{a.name ?? "—"}</td>
                <td className="px-4 py-2.5">{a.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${a.role === "MASTER" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700"}`}>
                    {a.role === "MASTER" ? "Master" : "Admin"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${a.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {a.active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-3">
                    <form action={toggleAdmin}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-brand hover:underline">{a.active ? "Disable" : "Enable"}</button>
                    </form>
                    <form action={deleteAdmin}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
