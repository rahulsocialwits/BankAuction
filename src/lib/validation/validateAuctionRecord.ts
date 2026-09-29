import { NormalizedAuctionRecord } from "@/data-sources/bankauctions/normalize";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  needsReview: boolean; // true if extraction is usable but uncertain enough for manual review
}

/**
 * Structural/sanity checks only — this never invents or corrects values,
 * it only decides whether a record is complete/sane enough to store, and
 * whether it should be routed to PENDING_REVIEW vs a more confident state.
 */
export function validateAuctionRecord(record: NormalizedAuctionRecord): ValidationResult {
  const errors: string[] = [];

  if (!record.title) errors.push("Missing title");
  if (!record.externalAuctionId) errors.push("Missing external auction/listing ID (needed for dedup)");
  if (record.reservePrice !== null && record.reservePrice <= 0) errors.push("Reserve price is not a positive number");
  if (record.emd !== null && record.emd < 0) errors.push("EMD is negative");
  if (record.auctionStart && record.auctionEnd && record.auctionStart > record.auctionEnd) {
    errors.push("Auction start is after auction end");
  }

  const needsReview =
    record.category === null || // couldn't classify the property type
    record.reservePrice === null ||
    record.auctionStart === null;

  return { isValid: errors.length === 0, errors, needsReview };
}
