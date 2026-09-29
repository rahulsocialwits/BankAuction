import { loginAdmin } from "./actions";

export default async function AdminLoginPage({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){
 const {error,next}=await searchParams;
 return <main className="min-h-screen bg-brand-bg flex items-center justify-center px-5">
  <div className="w-full max-w-md">
   <div className="text-center mb-5"><div className="inline-flex items-center rounded-2xl bg-brand px-4 py-3 text-white text-lg font-extrabold">BA</div><div className="mt-3 text-xl font-extrabold text-brand">BankAuction<span className="text-gold">.co</span></div><p className="text-xs text-brand-muted mt-1">Secure admin control center</p></div>
   <div className="ba-card p-7 sm:p-9">
    {error&&<div className="mb-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">Incorrect password. Please try again.</div>}
    <div className="mb-7"><div className="ba-kicker">Secure access</div><h1 className="text-2xl font-extrabold text-brand">Welcome back</h1><p className="text-sm text-brand-muted mt-1">Manage properties, auction sources and publishing from one place.</p></div>
    <form action={loginAdmin} className="space-y-4"><input type="hidden" name="next" value={next??"/admin"}/><label className="block"><span className="block text-xs font-bold text-brand mb-1.5">Admin password</span><input id="password" name="password" type="password" required autoFocus className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="Enter admin password"/></label><button className="w-full rounded-xl bg-brand text-white font-bold py-3 hover:bg-brand-dark transition-colors">Sign in to dashboard</button></form>
    <div className="mt-6 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-xl bg-brand-bg p-3"><b className="block text-brand">Auto fetch</b><span className="text-brand-muted">Every 30 minutes</span></div><div className="rounded-xl bg-brand-bg p-3"><b className="block text-brand">Source</b><span className="text-brand-muted">BankAuctions.in</span></div></div>
   </div>
  </div>
 </main>
}