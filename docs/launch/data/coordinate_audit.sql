-- READ-ONLY coordinate audit (Track A4). Run in the Supabase SQL editor. Every statement is a SELECT; nothing is changed.
-- Table and column names are from prisma/schema.prisma: properties (status, latitude, longitude, "geoCity", "geoState",
-- "addressText"), property_attributes (key = 'coord_quality': 'pincode' | 'city_centroid'; no row = point taken from the notice).

-- 1. Totals for published properties
select
  count(*)                                                                             as published,
  count(*) filter (where latitude is not null and longitude is not null)               as with_coordinates,
  count(*) filter (where latitude between 6 and 37.6 and longitude between 68 and 97.5
                     and not (latitude = 0 and longitude = 0))                         as valid_range_india,
  count(*) filter (where latitude is null or longitude is null)                        as missing_coordinates,
  count(*) filter (where "geoCity" is null or "geoState" is null)                      as missing_city_or_state
from properties where status = 'PUBLISHED';

-- 2. Points outside India or swapped (should be 0)
select id, slug, latitude, longitude
from properties
where status = 'PUBLISHED' and latitude is not null
  and not (latitude between 6 and 37.6 and longitude between 68 and 97.5)
limit 50;

-- 3. How each stored point was obtained
select coalesce(a.value, 'notice (exact)') as source_of_point, count(*) as properties
from properties p
left join property_attributes a on a."propertyId" = p.id and a.key = 'coord_quality'
where p.status = 'PUBLISHED' and p.latitude is not null
group by 1 order by 2 desc;

-- 4. Coverage by city (top 40 by size), Mumbai included
select p."geoCity" as city, count(*) as published,
       count(*) filter (where p.latitude is not null) as with_coordinates,
       count(*) filter (where a.value = 'pincode') as pin_area,
       count(*) filter (where a.value = 'city_centroid') as city_centre
from properties p
left join property_attributes a on a."propertyId" = p.id and a.key = 'coord_quality'
where p.status = 'PUBLISHED' and p."geoCity" is not null
group by 1 order by 2 desc limit 40;

-- 5. Mumbai definitions (the numbers behind the Explore-by-city tile)
select status, count(*) from properties where "geoCity" ilike 'mumbai' group by status order by 2 desc;

-- 6. Possible city / point mismatch: a point more than about 0.5 degree (about 55 km) from the centre stored for its city.
--    cities.latitude / cities.longitude hold the city centre (see src/lib/map/cityCoordinates.ts).
select p."geoCity", c.name as city_row, count(*) as properties
from properties p
join cities c on c.slug = lower(regexp_replace(p."geoCity", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || lower(regexp_replace(p."geoState", '[^a-zA-Z0-9]+', '-', 'g'))
where p.status = 'PUBLISHED' and p.latitude is not null and c.latitude is not null
  and (abs(p.latitude - c.latitude) > 0.5 or abs(p.longitude - c.longitude) > 0.5)
group by 1, 2 order by 3 desc limit 40;

-- 7. PINs that could not be placed (rejected by the state / city check) and what is still waiting
select split_part(a.value, ':', 2) as pin, count(*) as properties
from property_attributes a
where a.key = 'pin_geocode'
group by 1 order by 2 desc limit 50;
