-- Append-only audit trail for admin writes
CREATE TABLE "audit_logs" (
    "id"          TEXT NOT NULL,
    "actorId"     TEXT,
    "actorEmail"  TEXT,
    "action"      TEXT NOT NULL,
    "entityType"  TEXT,
    "entityId"    TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
