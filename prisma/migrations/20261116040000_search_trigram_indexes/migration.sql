-- P2.10: GIN trigram indexes for full-text keyword search performance.
-- The keyword search in publishedWhere.ts uses ILIKE, which requires pg_trgm
-- to avoid sequential scans on large property tables.
--
-- pg_trgm turns "ILIKE '%term%'" into an index scan on the GIN index,
-- reducing search latency from O(N) table scan to O(log N + k).
-- Safe on a live database: CREATE INDEX never deletes data.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Properties: the main search columns
CREATE INDEX IF NOT EXISTS "properties_title_trgm_idx"
  ON "properties" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "properties_description_trgm_idx"
  ON "properties" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "properties_address_text_trgm_idx"
  ON "properties" USING GIN ("addressText" gin_trgm_ops);

-- Geo fields: also searched with ILIKE in keywordClauses / publishedWhere
CREATE INDEX IF NOT EXISTS "properties_geo_city_trgm_idx"
  ON "properties" USING GIN ("geoCity" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "properties_geo_locality_trgm_idx"
  ON "properties" USING GIN ("geoLocality" gin_trgm_ops);
