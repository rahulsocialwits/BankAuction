-- READ ONLY. Count existing stored records attributed to Find Auction; do not delete or modify anything.
-- Run only in the approved read-only database session. Return aggregate counts only; do not export row-level data.
SELECT
  COUNT(DISTINCT sr.id) AS source_record_count,
  COUNT(DISTINCT sr."propertyId") FILTER (WHERE sr."propertyId" IS NOT NULL) AS linked_property_count,
  COUNT(DISTINCT sr."auctionId") FILTER (WHERE sr."auctionId" IS NOT NULL) AS linked_auction_count
FROM source_records sr
LEFT JOIN sources s ON s.id = sr."sourceId"
WHERE
  LOWER(COALESCE(s.name, '')) LIKE '%find auction%'
  OR LOWER(COALESCE(s."baseUrl", '')) LIKE '%findauction.in%'
  OR LOWER(sr."sourceUrl") ~ '^https?://([^/]*\.)?findauction\.in([/:?#]|$)';
