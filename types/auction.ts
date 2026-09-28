export type PropertyType =
  | "residential"
  | "commercial"
  | "industrial"
  | "agricultural"
  | "land"
  | "vehicle";

export type AuctionStatus =
  | "upcoming"
  | "live"
  | "completed"
  | "postponed"
  | "cancelled"
  | "expired";

export interface AuctionRecord {
  id: string;
  externalAuctionId?: string;
  listingId?: string;
  auctionType?: string;
  auctionMethod?: string;

  reservePrice?: number;
  emdAmount?: number;
  minimumIncrement?: number;

  auctionStart?: string;
  auctionEnd?: string;
  applicationDeadline?: string;

  possessionStatus?: string;
  inspectionDetails?: string;

  bankId?: string;
  branch?: string;
  authorizedOfficerName?: string;
  authorizedOfficerPhone?: string;
  authorizedOfficerEmail?: string;

  borrowerName?: string;

  sourceId: string;
  sourceUrl: string;
  status: AuctionStatus;
}
