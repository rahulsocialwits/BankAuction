-- Migration: add a unique constraint on (bankId, externalAuctionId) in the auctions table.
--
-- Purpose: prevent duplicate auction rows at the database level when two concurrent
-- import ticks both see an empty in-memory knownByBank map and each attempt to insert
-- the same (bank, externalAuctionId) combination.
--
-- Safety notes:
--   * NULL values are ALWAYS distinct in PostgreSQL unique indexes.
--     Two rows where bankId IS NULL and/or externalAuctionId IS NULL do NOT conflict.
--     Only rows where BOTH columns are non-NULL and equal trigger a P2002 violation.
--   * Re-auction rounds are already blocked at application level
--     (addReauctionRound returns false when the external ID matches an existing round).
--   * Run this migration ONLY after verifying that no two rows in production share
--     the same non-NULL (bankId, externalAuctionId) pair. Use the SQL query below
--     to check before applying:
--
--       SELECT bank_id, external_auction_id, COUNT(*)
--       FROM auctions
--       WHERE bank_id IS NOT NULL AND external_auction_id IS NOT NULL
--       GROUP BY bank_id, external_auction_id
--       HAVING COUNT(*) > 1;
--
--   * If that query returns rows, those are the Oct-2026 duplicates. The owner must
--     decide which row to keep (keep the one referenced by the SourceRecord, or the
--     most-recently-updated one) and delete the others before this migration can run.
--
-- The application code (csvImport.ts) also catches Prisma error P2002 (unique violation)
-- and recovers gracefully by looking up the conflicting row and continuing.

CREATE UNIQUE INDEX IF NOT EXISTS "auctions_bankId_externalAuctionId_key"
  ON "auctions"("bankId", "externalAuctionId")
  WHERE "bankId" IS NOT NULL AND "externalAuctionId" IS NOT NULL;
