-- P2.3: Add distinguishing attributes to Auction model.
-- Additive only; no data is modified; safe to apply on a live database.
ALTER TABLE "auctions" ADD COLUMN "unitOrDoorNumber" TEXT;
ALTER TABLE "auctions" ADD COLUMN "floorNumber" TEXT;
ALTER TABLE "auctions" ADD COLUMN "buildingName" TEXT;
ALTER TABLE "auctions" ADD COLUMN "surveyOrKhasra" TEXT;
ALTER TABLE "auctions" ADD COLUMN "plotNumber" TEXT;
ALTER TABLE "auctions" ADD COLUMN "areaSqft" DECIMAL(12,2);
ALTER TABLE "auctions" ADD COLUMN "areaType" TEXT;
