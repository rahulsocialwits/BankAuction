-- WP16.4: Support tickets for user error reports from property pages.
-- Append-only: never delete rows; use status=CLOSED instead.

CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

CREATE TABLE "support_tickets" (
    "id"              TEXT NOT NULL,
    "propertyId"      TEXT,
    "reporterEmail"   TEXT,
    "subject"         TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "status"          "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt"      TIMESTAMP(3),
    "resolvedBy"      TEXT,
    "resolution"      TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");
CREATE INDEX "support_tickets_propertyId_idx" ON "support_tickets"("propertyId");

ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
