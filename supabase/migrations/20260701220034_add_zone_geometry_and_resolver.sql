alter table public.delivery_zones add column center_lat double precision;
alter table public.delivery_zones add column center_lng double precision;
alter table public.delivery_zones add column radius_km numeric;

comment on column public.delivery_zones.center_lat is 'Zone center latitude (hub) for radius-based serviceability.';
comment on column public.delivery_zones.center_lng is 'Zone center longitude (hub) for radius-based serviceability.';
comment on column public.delivery_zones.radius_km is 'Serviceable radius in km from the zone center.';

insert into public.delivery_zones (name, city, delivery_fee, is_active, sort_order, center_lat, center_lng, radius_km)
values ('Ibadan Core (5km)', 'Ibadan', 0, true, 1, 7.342134, 3.847802, 5);

create or replace function public.resolve_delivery_zone(lat double precision, lng double precision)
returns table (zone_id bigint, zone_name text, delivery_fee numeric, min_order numeric, eta_note text, distance_km numeric)
language sql stable as $$
  select dz.id, dz.name, dz.delivery_fee, dz.min_order, dz.eta_note,
         round((6371 * acos( least(1, greatest(-1,
           cos(radians(lat)) * cos(radians(dz.center_lat)) *
           cos(radians(dz.center_lng) - radians(lng)) +
           sin(radians(lat)) * sin(radians(dz.center_lat)) ))))::numeric, 2) as distance_km
  from public.delivery_zones dz
  where dz.is_active
    and dz.center_lat is not null
    and (6371 * acos( least(1, greatest(-1,
          cos(radians(lat)) * cos(radians(dz.center_lat)) *
          cos(radians(dz.center_lng) - radians(lng)) +
          sin(radians(lat)) * sin(radians(dz.center_lat)) )))) <= dz.radius_km
  order by distance_km asc
  limit 1;
$$;

comment on function public.resolve_delivery_zone is 'Serviceability check: returns the nearest active zone containing the point (haversine radius match), or no rows if out of delivery area. Call client-side for UX and server-side at checkout for enforcement.';
