-- READ-ONLY (Track 1b). Counts stored listings that came from findauction.in. Nothing is changed or deleted.
-- Auction rows keep the source URL (auctions."sourceUrl"); properties are linked through auctions."propertyId".

-- 1. How many properties and auction rounds
select count(distinct p.id) as properties, count(a.id) as auction_rounds
from properties p join auctions a on a."propertyId" = p.id
where a."sourceUrl" ilike '%findauction%';

-- 2. By property status (PUBLISHED ones are visible on the website)
select p.status, count(distinct p.id) as properties
from properties p join auctions a on a."propertyId" = p.id
where a."sourceUrl" ilike '%findauction%'
group by 1 order by 2 desc;

-- 3. A sample to look at (first 25)
select p.slug, p.status, p."createdAt", a."sourceUrl"
from properties p join auctions a on a."propertyId" = p.id
where a."sourceUrl" ilike '%findauction%'
order by p."createdAt" desc limit 25;
