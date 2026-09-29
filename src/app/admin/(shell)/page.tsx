import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
export const dynamic="force-dynamic";

export default async function AdminDashboardPage(){
 const start=new Date(); start.setHours(0,0,0,0);
 const [total,published,pending,upcoming,live,newToday,source,jobs]=await Promise.all([
  prisma.property.count(),
  prisma.property.count({where:{status:"PUBLISHED"}}),
  prisma.property.count({where:{status:"PENDING_REVIEW"}}),
  prisma.auction.count({where:{status:"UPCOMING"}}),
  prisma.auction.count({where:{status:{in:["LIVE","AUCTION_TODAY"]}}}),
  prisma.property.count({where:{createdAt:{gte:start}}}),
  prisma.source.findFirst({where:{name:"BankAuctions.in"}}),
  prisma.importJob.findMany({orderBy:{startedAt:"desc"},take:6})
 ]);
 const cards=[[total,"Total properties","All records"],[published,"Published","Visible on website"],[pending,"Needs review","Review queue"],[newToday,"Added today","Fresh records"],[upcoming,"Upcoming","Future auctions"],[live,"Live / today","Active auctions"]];
 return <div className="space-y-7">
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
   <div><div className="ba-kicker">Overview</div><h1 className="text-3xl font-extrabold text-brand mt-1">Admin dashboard</h1><p className="text-sm text-brand-muted mt-1">Monitor listings, source health and automatic property ingestion.</p></div>
   <Link href="/admin/properties" className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white">Manage properties →</Link>
  </div>
  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
   {cards.map(([value,label,desc])=><Link key={String(label)} href="/admin/properties" className="ba-card p-5 hover:border-brand transition-colors"><div className="text-2xl font-extrabold text-brand">{value}</div><div className="mt-1 text-sm font-bold">{label}</div><div className="mt-1 text-xs text-brand-muted">{desc}</div></Link>)}
  </div>
  <div className="grid lg:grid-cols-[1.35fr_.75fr] gap-5">
   <section className="ba-card overflow-hidden">
    <div className="p-5 border-b border-brand-border flex items-center justify-between"><div><div className="text-xs font-bold text-brand">Automatic property fetch</div><p className="text-xs text-brand-muted mt-1">BankAuctions.in is checked every 30 minutes.</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/> Every 30 min</span></div>
    <div className="p-5 grid sm:grid-cols-3 gap-3"><div className="rounded-xl bg-brand-bg p-4"><div className="text-[10px] uppercase text-brand-muted">Source</div><div className="font-bold text-sm mt-1">BankAuctions.in</div></div><div className="rounded-xl bg-brand-bg p-4"><div className="text-[10px] uppercase text-brand-muted">Last success</div><div className="font-bold text-xs mt-1">{source?.lastSuccessfulSync?new Date(source.lastSuccessfulSync).toLocaleString("en-IN"):"Not run yet"}</div></div><div className="rounded-xl bg-brand-bg p-4"><div className="text-[10px] uppercase text-brand-muted">Health</div><div className="font-bold text-sm mt-1">{source?.status??"WAITING"}</div></div></div>
   </section>
   <section className="ba-card p-5"><div className="text-xs font-bold text-brand mb-4">Quick actions</div><div className="space-y-2"><Link href="/admin/properties?status=PENDING_REVIEW" className="block rounded-xl border border-brand-border p-3 text-sm font-semibold hover:border-brand">Review pending <span className="float-right text-brand-muted">{pending} →</span></Link><Link href="/admin/sources" className="block rounded-xl border border-brand-border p-3 text-sm font-semibold hover:border-brand">Source health <span className="float-right text-brand-muted">→</span></Link><Link href="/properties" target="_blank" className="block rounded-xl border border-brand-border p-3 text-sm font-semibold hover:border-brand">Open website <span className="float-right text-brand-muted">↗</span></Link></div></section>
  </div>
  <section className="ba-card overflow-hidden"><div className="p-5 border-b border-brand-border"><div className="text-xs font-bold text-brand">Recent ingestion runs</div><p className="text-xs text-brand-muted mt-1">Latest scheduled fetch activity.</p></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-brand-bg text-brand-muted"><tr><th className="px-5 py-3 text-left">Started</th><th className="px-5 py-3 text-left">Checked</th><th className="px-5 py-3 text-left">New</th><th className="px-5 py-3 text-left">Updated</th><th className="px-5 py-3 text-left">Errors</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id} className="border-t border-brand-border"><td className="px-5 py-3">{new Date(j.startedAt).toLocaleString("en-IN")}</td><td className="px-5 py-3">{j.pagesChecked}</td><td className="px-5 py-3 text-emerald-700 font-bold">{j.newProperties}</td><td className="px-5 py-3">{j.updatedProperties}</td><td className={j.failures?"px-5 py-3 text-red-600 font-bold":"px-5 py-3 text-brand-muted"}>{j.failures}</td></tr>)}</tbody></table></div></section>
 </div>
}