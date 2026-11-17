-- P1.3: add sourcePublishedAt to source_records.
--
-- sourcePublishedAt: the date the source (e.g. bankauctions.in) itself first published
--   this auction listing. Extracted from the source page where available (e.g. "Notice Date",
--   "Published Date"). Null for all existing rows and for sources that do not expose a
--   publication date.
--
-- This is additive: no data is changed, removed, or rewritten.

ALTER TABLE "source_records" ADD COLUMN "sourcePublishedAt" TIMESTAMP(3);
