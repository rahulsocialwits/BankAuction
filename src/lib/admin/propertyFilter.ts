import type { Prisma, PropertyStatus } from "@prisma/client";

export interface PropertyFilters {
  status?: string;
  q?: string;
  source?: string; // auction.statusSource, e.g. "feed:Eauction"
  bank?: string; // bank id
  issue?: string; // one of ISSUES
  master: boolean;
}

/** "Wrong or thin information" filters: find listings a source filled badly, then hide them all at once. */
export const ISSUES: [string, string][] = [
  ["no_reserve", "No reserve price"],
  ["no_emd", "No EMD"],
  ["no_date", "No auction date"],
  ["no_officer", "No authorised officer"],
  ["no_address", "No address"],
  ["no_docs", "No documents"],
];

export function propertyWhere(f: PropertyFilters): Prisma.PropertyWhereInput {
  const active = f.status && f.status !== "ALL" && (f.master || f.status !== "DUPLICATE") ? f.status : "ALL";
  const a: Prisma.AuctionWhereInput = {};
  if (f.source) a.statusSource = f.source;
  if (f.bank) a.bankId = f.bank;
  if (f.issue === "no_reserve") a.reservePrice = null;
  if (f.issue === "no_emd") a.emd = null;
  if (f.issue === "no_date") a.auctionStart = null;
  if (f.issue === "no_officer") a.authorizedOfficer = null;
  const and: Prisma.PropertyWhereInput[] = [];
  if (Object.keys(a).length) and.push({ auctions: { some: a } });
  if (f.issue === "no_address") and.push({ OR: [{ addressText: null }, { addressText: "" }] });
  if (f.issue === "no_docs") and.push({ documents: { none: {} } });
  return {
    // "All" hides duplicates and removed items so they never clutter the working list.
    status: active === "ALL" ? { notIn: ["DUPLICATE", "REMOVED"] } : (active as PropertyStatus),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { addressText: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}
