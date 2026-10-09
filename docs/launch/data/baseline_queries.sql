-- READ-ONLY baseline queries for the OPERATOR. SELECT statements only. Run on a read replica or during low traffic.
-- Never paste results containing personal data; counts only.
-- Q1 published properties
SELECT count(*) AS published FROM properties WHERE status = 'PUBLISHED';
-- Q2 published, location never checked
SELECT count(*) AS never_checked FROM properties WHERE status = 'PUBLISHED' AND "geoCheckedAt" IS NULL;
-- Q3 published, checked but no city
SELECT count(*) AS checked_no_city FROM properties WHERE status = 'PUBLISHED' AND "geoCheckedAt" IS NOT NULL AND "geoCity" IS NULL;
-- Q3b published with a city
SELECT count(*) AS with_city FROM properties WHERE status = 'PUBLISHED' AND "geoCity" IS NOT NULL;
-- Q4 published with coordinates
SELECT count(*) AS with_coords FROM properties WHERE status = 'PUBLISHED' AND latitude IS NOT NULL AND longitude IS NOT NULL;
-- Q5 published properties whose newest round has neither start nor end date
SELECT count(*) AS undated_latest_round FROM properties p
WHERE p.status = 'PUBLISHED' AND EXISTS (SELECT 1 FROM auctions a WHERE a."propertyId" = p.id)
AND NOT EXISTS (SELECT 1 FROM auctions a WHERE a."propertyId" = p.id AND (a."auctionStart" IS NOT NULL OR a."auctionEnd" IS NOT NULL));
-- Q6 rounds where end is before start
SELECT count(*) AS end_before_start FROM auctions WHERE "auctionEnd" < "auctionStart";
-- Q7 published properties with no auction round
SELECT count(*) AS no_round FROM properties p WHERE p.status = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM auctions a WHERE a."propertyId" = p.id);
-- Q8 published with no category
SELECT count(*) AS no_category FROM properties WHERE status = 'PUBLISHED' AND category IS NULL;
-- Q9 location job recent history (counts only)
SELECT date_trunc('day', "startedAt") AS day, count(*) AS runs, sum(created) AS created, sum(updated) AS updated
FROM source_run_logs WHERE "startedAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1 DESC;
