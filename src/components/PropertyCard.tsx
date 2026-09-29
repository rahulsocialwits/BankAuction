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
}

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: "bg-blue-50 text-blue-700",
  LIVE: "bg-green-50 text-green-700",
  AUCTION_TODAY: "bg-orange-50 text-orange-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  POSTPONED: "bg-yellow-50 text-yellow-700",
  CANCELLED: "bg-red-50 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

function formatMoney(v: unknown): string {
  if (v === null || v === undefined) return "Not Available";
  return `₹${Number(v).toLocaleString("en-IN")}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "Not Available";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export default function PropertyCard({ property }: { property: PropertyCardData }) {
  return (
    <Link
      href={`/property/${property.slug}`}
      className="block bg-white border border-brand-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="h-36 bg-gradient-to-br from-brand-bg to-brand-border flex items-center justify-center text-xs text-brand-muted">
        No image provided by source
      </div>
      <div className="p-4">
        <span
          className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded mb-2 ${STATUS_STYLES[property.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}
        >
          {property.status ?? "STATUS UNKNOWN"}
        </span>
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1">{property.title}</h3>
        <p className="text-xs text-brand-muted mb-2">
          {property.addressText ?? "Location not specified"}
          {property.bankName ? ` · ${property.bankName}` : ""}
        </p>
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="text-brand-muted">Reserve Price</div>
            <div className="font-semibold text-brand">{formatMoney(property.reservePrice)}</div>
          </div>
          <div className="text-right">
            <div className="text-brand-muted">Auction</div>
            <div className="font-medium">{formatDate(property.auctionStart)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
