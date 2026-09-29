import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6 lg:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
