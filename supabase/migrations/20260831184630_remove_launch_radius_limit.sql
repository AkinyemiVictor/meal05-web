begin;

alter table public.delivery_zones
  drop constraint if exists delivery_zones_zone_type_valid;

alter table public.delivery_zones
  add constraint delivery_zones_zone_type_valid
  check (zone_type = any (array['radius'::text, 'polygon'::text, 'unrestricted'::text]));

update public.delivery_zones
set
  name = 'Ibadan Delivery Area',
  zone_type = 'unrestricted',
  radius_m = null,
  eta_note = 'Scheduled delivery; timing confirmed at checkout',
  updated_at = now()
where name = 'Akala Express Launch Zone';

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
    and p_lat between -90 and 90
    and p_lng between -180 and 180
    and (
      z.zone_type = 'unrestricted'
      or (
        z.zone_type = 'radius'
        and z.center_lat is not null
        and z.center_lng is not null
        and z.radius_m is not null
        and d.distance_m <= z.radius_m
      )
    )
  order by
    case when z.zone_type = 'unrestricted' then 1 else 0 end,
    z.priority asc,
    d.distance_m asc nulls last,
    z.id asc
  limit 1;
$function$;

comment on function public.resolve_delivery_zone(double precision, double precision, uuid)
is 'Resolves matching delivery zones and falls back to an unrestricted market zone without imposing a launch-radius cutoff.';

commit;
