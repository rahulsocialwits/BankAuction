-- Drop the partial index if it was already applied to production, then create the full unique index
-- that matches @@unique([bankId, externalAuctionId]) in schema.prisma.
-- PostgreSQL full unique indexes treat NULL as distinct (NULL != NULL), so two rows where either
-- column is NULL do not conflict — functionally identical to the previous partial index.
-- DROP IF EXISTS handles the case where the partial index was already applied manually.
DROP INDEX IF EXISTS "auctions_bankId_externalAuctionId_key";
CREATE UNIQUE INDEX "auctions_bankId_externalAuctionId_key" ON "auctions"("bankId", "externalAuctionId");
