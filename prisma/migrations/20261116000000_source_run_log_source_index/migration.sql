-- P1.2: add a composite index on (source, startedAt) in source_run_logs.
--
-- Purpose: per-source run history queries (Admin -> Engine -> History filtered by source,
-- and runLog.ts loadHistoricalRuns) filter by source name AND order/range by startedAt.
-- The existing single-column index on startedAt alone forces a filtered scan over ALL rows
-- when narrowing to one source; this index makes those queries efficient as the table grows
-- to hundreds of thousands of rows from 5-minute ticks.
--
-- This is additive: no data is changed, removed, or rewritten.

CREATE INDEX "source_run_logs_source_startedAt_idx" ON "source_run_logs"("source", "startedAt" DESC);
