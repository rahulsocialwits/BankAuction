import AdminSidebar from "@/components/admin/AdminSidebar";
import { getAdminSession } from "@/lib/auth/adminAuth";

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const isMaster = session?.role === "MASTER";
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AdminSidebar isMaster={isMaster} />
      <main className="flex-1 min-w-0 p-5 lg:p-8">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
