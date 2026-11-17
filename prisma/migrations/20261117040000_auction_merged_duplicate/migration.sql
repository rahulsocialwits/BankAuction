-- Migration: 20261117040000_auction_merged_duplicate
-- Purpose: add MERGED_DUPLICATE status and mergedIntoId to Auction for Phase 1.4 dedup soft-merge
--
-- OWNER ACTION REQUIRED: Run this migration on production after reviewing.
-- Apply with:  npx prisma migrate deploy
-- Rollback: see BANKAUCTION_ENGINE_HANDOVER.md Phase 1.4 rollback
--
-- Safety: adds an enum value and two nullable columns. No existing rows are modified.
-- The unique constraint @@unique([bankId, externalAuctionId]) already exists (added in an earlier migration).

-- Add MERGED_DUPLICATE to the AuctionStatus enum
ALTER TYPE "AuctionStatus" ADD VALUE IF NOT EXISTS 'MERGED_DUPLICATE';

-- Add mergedIntoId: the winning auction this duplicate was merged into (nullable)
ALTER TABLE "auctions"
  ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT REFERENCES "auctions"("id") ON DELETE SET NULL;

-- Index for looking up which auctions were merged into a given winner
CREATE INDEX IF NOT EXISTS "auctions_mergedIntoId_idx" ON "auctions"("mergedIntoId");
