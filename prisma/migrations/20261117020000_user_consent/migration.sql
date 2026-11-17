-- User consent fields: marketing opt-in and consent timestamp
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "marketingConsent"  BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "consentUpdatedAt"  TIMESTAMP(3);
