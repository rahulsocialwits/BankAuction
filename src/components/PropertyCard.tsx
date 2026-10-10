import SafeImage from "./SafeImage";
import Link from "next/link";
import { AuctionStatus, PropertyCategory } from "@prisma/client";

export interface PropertyCardData {
  slug: string;
  title: string;
  addressText: string | null;
  category: PropertyCategory | null;
  bankName: string | null;
  reservePrice: unknown; // Prisma Decimal | null
  auctionStart: Date | null;
  status: AuctionStatus | null;
  imageUrl: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: "bg-blue-600 text-white",
  LIVE: "bg-green-600 text-white",
  AUCTION_TODAY: "bg-orange-500 text-white",
  COMPLETED: "bg-gray-500 text-white",
  POSTPONED: "bg-yellow-500 text-white",
  CANCELLED: "bg-red-600 text-white",
  EXPIRED: "bg-gray-400 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Upcoming",
  LIVE: "Live",
  AUCTION_TODAY: "Auction Today",
  COMPLETED: "Completed",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const CATEGORY_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
  LAND_PLOT: "Land & Plot",
  AGRICULTURAL: "Agricultural",
  VEHICLE: "Vehicle",
};

function formatMoney(v: unknown): string {
  if (v === null || v === undefined) return "Not Available";
  const n = Number(v);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.?0+$/, "")} Lakh`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "Not Available";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export default function PropertyCard({ property }: { property: PropertyCardData }) {
  const status = property.status ?? "";
  return (
    <Link
      href={`/property/${property.slug}`}
      className="group flex flex-col h-full bg-white border border-brand-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition"
    >
      <div className="relative aspect-[5/3] bg-[#E8EDF5] overflow-hidden">
        <SafeImage
          src={property.imageUrl}
          alt={property.title}
          width={400}
          height={240}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {status && (
          <span className={`absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow ${STATUS_STYLES[status] ?? "bg-gray-500 text-white"}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        )}
        {property.category && (
          <span className="absolute top-3 right-3 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/90 text-brand">
            {CATEGORY_LABELS[property.category] ?? property.category}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 min-h-[2.5rem] text-black/90">{property.title}</h3>
        <p className="text-xs text-brand-muted mt-1.5 flex items-start gap-1 line-clamp-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="truncate">{property.addressText ?? "Location not specified"}</span>
        </p>
        {property.bankName && <p className="text-xs text-brand-muted mt-1 truncate">{property.bankName}</p>}

        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between border-t border-brand-border pt-3">
            {/* a value the notice does not state is left out, never shown as "Not Available" */}
            {property.reservePrice !== null && property.reservePrice !== undefined && (
              <div>
                <div className="text-[11px] text-brand-muted">Reserve Price</div>
                <div className="text-base font-bold text-brand">{formatMoney(property.reservePrice)}</div>
              </div>
            )}
            {property.auctionStart && (
              <div className="ml-auto text-right">
                <div className="text-[11px] text-brand-muted">Auction Date</div>
                <div className="text-xs font-medium">{formatDate(property.auctionStart)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
