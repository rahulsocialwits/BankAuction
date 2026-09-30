import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AdminSidebar />
      <main className="flex-1 min-w-0 p-5 lg:p-8">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
