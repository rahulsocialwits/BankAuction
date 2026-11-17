-- P1.2: add cursorPage and endedAt to source_run_logs.
--
-- cursorPage: the pagination cursor (page number) at the end of a run. Lets BAANKNET and paginated
--   sources record exactly where they stopped, so an operator reading History can verify resumed runs.
--   Additive: null for all existing rows and for sources that do not page.
--
-- endedAt: wall-clock timestamp when the run finished. durationMs lets you derive it, but the stored
--   startedAt + durationMs can drift if the row is written late; a real column is authoritative.
--   Additive: null for all existing rows.

ALTER TABLE "source_run_logs" ADD COLUMN "cursorPage" INTEGER;
ALTER TABLE "source_run_logs" ADD COLUMN "endedAt" TIMESTAMP(3);
