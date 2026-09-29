import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminShellLayout({children}:{children:React.ReactNode}){
 return <div className="min-h-screen flex bg-brand-bg"><AdminSidebar/><main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-9"><div className="max-w-[1180px] mx-auto">{children}</div></main></div>
}