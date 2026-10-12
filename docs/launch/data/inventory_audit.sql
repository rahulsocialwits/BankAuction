-- READ-ONLY inventory audit. Run in the Supabase SQL editor (or with the PowerShell helper in docs/launch/INVENTORY_AUDIT.md).
-- Every statement is a SELECT. Table / column names are from prisma/schema.prisma.
-- "Active" here is an approximation (open status AND not yet past its date); the website itself uses src/lib/domain/auctionLifecycle.ts.

-- 1. Totals by property status (DUPLICATE and REMOVED are not unique visible properties)
select status, count(*) as properties from properties group by 1 order by 2 desc;

-- 2. Unique published properties, and how many have auction rounds at all
select count(*) filter (where status = 'PUBLISHED') as published,
       count(*) filter (where status = 'PUBLISHED' and exists (select 1 from auctions a where a."propertyId" = p.id)) as published_with_round,
       count(*) filter (where status = 'DUPLICATE') as marked_duplicate
from properties p;

-- 3. By source (every auction round remembers its source in auctions."statusSource", e.g. 'feed:baanknet.com')
select coalesce(a."statusSource", '(none)') as source, count(distinct a."propertyId") as properties, count(*) as auction_rounds
from auctions a join properties p on p.id = a."propertyId" and p.status = 'PUBLISHED'
group by 1 order by 2 desc;

-- 4. By category (published)
select coalesce(category::text, '(none)') as category, count(*) as properties
from properties where status = 'PUBLISHED' group by 1 order by 2 desc;

-- 5. By bank (published, top 25)
select coalesce(b.name, '(no bank)') as bank, count(distinct p.id) as properties
from properties p join auctions a on a."propertyId" = p.id left join banks b on b.id = a."bankId"
where p.status = 'PUBLISHED' group by 1 order by 2 desc limit 25;

-- 6. By city (published, verified geoCity; top 25) and how many have none
select coalesce("geoCity", '(missing)') as city, count(*) as properties
from properties where status = 'PUBLISHED' group by 1 order by 2 desc limit 25;
select count(*) as published_without_city_or_state from properties where status = 'PUBLISHED' and ("geoCity" is null or "geoState" is null);

-- 7. Auction status of published properties (latest round), approximate active / upcoming / ended
select case
         when l.status in ('COMPLETED', 'EXPIRED') then 'ended'
         when l.status in ('POSTPONED', 'CANCELLED') then lower(l.status::text)
         when l."auctionStart" is null then 'open, no date'
         when l."auctionStart" < now() - interval '1 day' then 'open but date passed (shown as ended)'
         else 'active / upcoming'
       end as state, count(*) as properties
from properties p
join lateral (select status, "auctionStart" from auctions a where a."propertyId" = p.id order by a."createdAt" desc limit 1) l on true
where p.status = 'PUBLISHED' group by 1 order by 2 desc;

-- 8. Added in the last 24 hours / 7 days (this is what the imports produced recently)
select count(*) filter (where "createdAt" > now() - interval '24 hours') as last_24h,
       count(*) filter (where "createdAt" > now() - interval '7 days') as last_7d
from properties where status = 'PUBLISHED';

-- 9. Import history of the scheduler and sources (run logs): last success, last failure, per source, last 7 days
select source, count(*) as runs,
       count(*) filter (where status = 'ok') as ok, count(*) filter (where status = 'error') as errors, count(*) filter (where status = 'blocked') as blocked,
       max("startedAt") filter (where status = 'ok') as last_ok, max("startedAt") as last_run,
       sum(created) as created, sum(updated) as updated, sum(duplicates) as duplicates, sum(rejected) as rejected
from source_run_logs where "startedAt" > now() - interval '7 days'
group by 1 order by runs desc;

-- 10. The configured feed sources and their state
select name, url, active, "lastStatus", "lastRunAt", left(coalesce("lastMessage", ''), 120) as last_message
from feed_sources order by name;
