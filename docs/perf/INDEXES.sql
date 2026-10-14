-- BankAuction: speed fix, 4 missing database indexes (found 13 Oct 2026 with pg_stat_statements / pg_stat_user_tables).
-- Safe: only ADDS indexes (IF NOT EXISTS), changes no data, no columns. Each takes a few seconds on these table sizes (168k / 78k / 48k rows).
-- Run once in Supabase -> SQL Editor. Rollback: DROP INDEX <name>;  (each name is below).
-- Same four indexes are declared in prisma/schema.prisma so a later `prisma db push` finds nothing to change.

CREATE INDEX IF NOT EXISTS "property_changes_propertyId_detectedAt_idx" ON "property_changes" ("propertyId", "detectedAt" DESC);
CREATE INDEX IF NOT EXISTS "property_changes_auctionId_idx" ON "property_changes" ("auctionId");
CREATE INDEX IF NOT EXISTS "media_sourceUrl_idx" ON "media" ("sourceUrl");
CREATE INDEX IF NOT EXISTS "auctions_externalAuctionId_idx" ON "auctions" ("externalAuctionId");

ANALYZE "property_changes";
ANALYZE "media";
ANALYZE "auctions";
