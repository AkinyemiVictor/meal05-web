begin;

-- Replace the unrestricted launch area with three overlapping radius bands.
-- The resolver's priority ordering makes the smallest matching band win.
update public.delivery_zones
set
  name = 'Meal05 Core (0-5 km)',
  city = 'Ibadan',
  delivery_fee = 1500,
  eta_note = 'Core delivery zone; scheduled window confirmed at checkout',
  zone_type = 'radius',
  center_lat = 7.342134,
  center_lng = 3.847802,
  radius_m = 5000,
  priority = 1,
  sort_order = 1,
  is_active = true,
  updated_at = now()
where name = 'Ibadan Delivery Area';

insert into public.delivery_zones (
  name, city, delivery_fee, min_order, eta_note, is_active, sort_order,
  market_id, zone_type, center_lat, center_lng, radius_m, priority
)
values
  (
    'Meal05 Core (0-5 km)', 'Ibadan', 1500, null,
    'Core delivery zone; scheduled window confirmed at checkout', true, 1,
    public.default_market_id(), 'radius', 7.342134, 3.847802, 5000, 1
  ),
  (
    'Meal05 Extended (5-10 km)', 'Ibadan', 2500, null,
    'Extended delivery; timing confirmed at checkout', true, 2,
    public.default_market_id(), 'radius', 7.342134, 3.847802, 10000, 2
  ),
  (
    'Meal05 Extended Plus (10-20 km)', 'Ibadan', 3500, null,
    'Extended delivery; timing confirmed at checkout', true, 3,
    public.default_market_id(), 'radius', 7.342134, 3.847802, 20000, 3
  )
on conflict (name) do update set
  city = excluded.city,
  delivery_fee = excluded.delivery_fee,
  min_order = excluded.min_order,
  eta_note = excluded.eta_note,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  market_id = excluded.market_id,
  zone_type = excluded.zone_type,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_m = excluded.radius_m,
  priority = excluded.priority,
  updated_at = now();

update public.delivery_zones
set is_active = false, updated_at = now()
where market_id = public.default_market_id()
  and name not in (
    'Meal05 Core (0-5 km)',
    'Meal05 Extended (5-10 km)',
    'Meal05 Extended Plus (10-20 km)'
  );

-- Keep the configured partner but charge the customer-facing distance-band fee.
with active_partner as (
  select distinct dps.partner_id
  from public.delivery_partner_services dps
  join public.delivery_zones z on z.id = dps.zone_id
  where z.name = 'Meal05 Core (0-5 km)'
    and dps.is_active = true
), bands as (
  select id, delivery_fee, eta_note
  from public.delivery_zones
  where market_id = public.default_market_id()
    and name in (
      'Meal05 Core (0-5 km)',
      'Meal05 Extended (5-10 km)',
      'Meal05 Extended Plus (10-20 km)'
    )
)
insert into public.delivery_partner_services (
  partner_id, zone_id, pricing_method, base_fee, currency_code,
  eta_note, ranking, is_recommended, is_active
)
select
  ap.partner_id,
  bands.id,
  'flat',
  bands.delivery_fee,
  'NGN',
  bands.eta_note,
  1,
  true,
  true
from active_partner ap
cross join bands
on conflict (partner_id, zone_id) do update set
  pricing_method = excluded.pricing_method,
  base_fee = excluded.base_fee,
  currency_code = excluded.currency_code,
  eta_note = excluded.eta_note,
  ranking = excluded.ranking,
  is_recommended = excluded.is_recommended,
  is_active = excluded.is_active;

create or replace function public.resolve_delivery_zone(
  p_lat double precision,
  p_lng double precision,
  p_market_id uuid default public.default_market_id()
)
returns table(
  zone_id bigint,
  zone_name text,
  delivery_fee numeric,
  min_order numeric,
  eta_note text,
  distance_m double precision
)
language sql
stable
set search_path = ''
as $function$
  select
    z.id,
    z.name,
    z.delivery_fee,
    z.min_order,
    z.eta_note,
    d.distance_m
  from public.delivery_zones z
  cross join lateral (
    select 6371000.0 * 2.0 * asin(
      least(1.0, sqrt(
        power(sin(radians(p_lat - z.center_lat) / 2.0), 2) +
        cos(radians(z.center_lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - z.center_lng) / 2.0), 2)
      ))
    ) as distance_m
  ) d
  where z.market_id = p_market_id
    and z.is_active = true
    and z.zone_type = 'radius'
    and z.center_lat is not null
    and z.center_lng is not null
    and z.radius_m is not null
    and p_lat between -90 and 90
    and p_lng between -180 and 180
    and d.distance_m <= z.radius_m
  order by z.priority asc, d.distance_m asc, z.id asc
  limit 1;
$function$;

comment on function public.resolve_delivery_zone(double precision, double precision, uuid)
is 'Resolves the smallest active Meal05 distance band containing a delivery pin. Returns no row beyond the configured extended-delivery limit so pickup can be offered instead.';

-- Remove the customer-facing 1-cup choice without deleting historical order links.
update public.product_variants pv
set is_active = false,
    is_default = false,
    updated_at = now()
from public.products p
where p.id = pv.product_id
  and lower(p.name) = 'honey beans (oloyin)'
  and lower(coalesce(pv.name, '')) = '1 cup (150g)';

notify pgrst, 'reload schema';

commit;
