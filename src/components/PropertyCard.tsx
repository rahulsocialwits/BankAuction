import Link from "next/link";
import { AuctionStatus, PropertyCategory } from "@prisma/client";

export interface PropertyCardData {slug:string;title:string;addressText:string|null;category:PropertyCategory|null;bankName:string|null;reservePrice:unknown;auctionStart:Date|null;status:AuctionStatus|null}
const STATUS:Record<string,{label:string;cls:string}>={UPCOMING:{label:"Upcoming",cls:"bg-blue-50 text-blue-700"},LIVE:{label:"Live",cls:"bg-emerald-50 text-emerald-700"},AUCTION_TODAY:{label:"Auction Today",cls:"bg-amber-50 text-amber-800"},COMPLETED:{label:"Completed",cls:"bg-gray-100 text-gray-600"},POSTPONED:{label:"Postponed",cls:"bg-orange-50 text-orange-700"},CANCELLED:{label:"Cancelled",cls:"bg-red-50 text-red-700"},EXPIRED:{label:"Expired",cls:"bg-gray-100 text-gray-500"}};
const ICON:Record<string,string>={RESIDENTIAL:"⌂",COMMERCIAL:"▥",INDUSTRIAL:"▦",LAND_PLOT:"⌗",AGRICULTURAL:"♧",VEHICLE:"▱"};
function money(v:unknown){if(v===null||v===undefined)return"Not available";return "₹"+Number(v).toLocaleString("en-IN")}
function date(v:Date|null){return v?new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",year:"numeric"}).format(v):"Not available"}
export default function PropertyCard({property}:{property:PropertyCardData}){
 const s=STATUS[property.status??""]??{label:"Status pending",cls:"bg-gray-100 text-gray-600"};
 return <Link href={`/property/${property.slug}`} className="group block ba-card overflow-hidden hover:-translate-y-0.5 hover:shadow-xl transition-all">
  <div className="relative h-44 bg-gradient-to-br from-[#eef2f7] to-[#dfe6ef] overflow-hidden">
   <div className="absolute inset-0 opacity-40" style={{backgroundImage:"radial-gradient(circle at 20% 20%,#fff 0 2px,transparent 3px),linear-gradient(135deg,transparent 50%,rgba(16,33,61,.08) 50%)",backgroundSize:"24px 24px,100% 100%"}}/>
   <div className="absolute left-4 top-4 flex items-center gap-2"><span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span></div>
   <div className="absolute right-4 top-4 w-11 h-11 rounded-xl bg-white/90 border border-white flex items-center justify-center text-xl text-brand shadow-sm">{ICON[property.category??""]??"⌂"}</div>
   <div className="absolute bottom-4 left-4 right-4"><span className="inline-flex rounded-lg bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-semibold text-brand shadow-sm">{property.category?.replace("_"," ")??"Property Auction"}</span></div>
  </div>
  <div className="p-5">
   <h3 className="font-bold text-[15px] leading-6 text-brand line-clamp-2 group-hover:text-gold transition-colors">{property.title}</h3>
   <p className="mt-2 text-xs text-brand-muted line-clamp-2">{property.addressText??"Location not specified"}</p>
   <div className="mt-4 pt-4 border-t border-brand-border grid grid-cols-2 gap-4">
    <div><div className="text-[10px] uppercase tracking-wide text-brand-muted">Reserve Price</div><div className="mt-1 text-sm font-extrabold text-brand">{money(property.reservePrice)}</div></div>
    <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-brand-muted">Auction Date</div><div className="mt-1 text-sm font-semibold text-brand">{date(property.auctionStart)}</div></div>
   </div>
   <div className="mt-4 flex items-center justify-between text-[11px]"><span className="text-brand-muted">{property.bankName??"Bank not specified"}</span><span className="font-bold text-brand group-hover:translate-x-0.5 transition-transform">View details →</span></div>
  </div>
 </Link>
}
