-- Rider directory fields, private rider photos, package counts, and atomic route creation.

create sequence if not exists public.delivery_partner_rider_code_seq start with 1 increment by 1;

alter table public.delivery_partners
  add column if not exists rider_code text,
  add column if not exists photo_path text;

update public.delivery_partners
set rider_code = 'M05-' || lpad(nextval('public.delivery_partner_rider_code_seq')::text, 3, '0')
where rider_code is null or btrim(rider_code) = '';

alter table public.delivery_partners
  alter column rider_code set default ('M05-' || lpad(nextval('public.delivery_partner_rider_code_seq')::text, 3, '0')),
  alter column rider_code set not null;

create unique index if not exists delivery_partners_rider_code_unique
  on public.delivery_partners (upper(rider_code));

alter table public.delivery_route_stops
  add column if not exists package_count integer not null default 1;

alter table public.delivery_route_stops
  drop constraint if exists delivery_route_stops_package_count_check;

alter table public.delivery_route_stops
  add constraint delivery_route_stops_package_count_check
  check (package_count between 1 and 50);

comment on column public.delivery_partners.rider_code is 'Short customer-safe Meal05 rider identifier.';
comment on column public.delivery_partners.photo_path is 'Private rider-photos storage object path. Never expose directly.';
comment on column public.delivery_route_stops.package_count is 'Physical packages handed to the rider for this stop.';

-- delivery_partners includes internal verification and guarantor data. Browser roles
-- must not be able to select the full row; server endpoints return explicit safe fields.
drop policy if exists delivery_partners_public_read on public.delivery_partners;
drop policy if exists delivery_partners_admin_all on public.delivery_partners;
revoke all on table public.delivery_partners from anon, authenticated;
grant all on table public.delivery_partners to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-photos',
  'rider-photos',
  false,
  1500000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.create_delivery_route_with_packages_transaction(
  p_actor_user_id uuid,
  p_order_ids integer[],
  p_delivery_partner_id uuid,
  p_vehicle_type text,
  p_planned_start_time timestamptz,
  p_pickup_location text,
  p_agreed_partner_payment numeric,
  p_other_delivery_cost numeric,
  p_notes text,
  p_hash_secret text,
  p_token_expires_hours integer,
  p_require_pin boolean,
  p_ip_address text,
  p_user_agent text,
  p_packages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_route_id uuid;
  v_package jsonb;
  v_order_id integer;
  v_package_count integer;
begin
  v_result := public.create_delivery_route_transaction(
    p_actor_user_id,
    p_order_ids,
    p_delivery_partner_id,
    p_vehicle_type,
    p_planned_start_time,
    p_pickup_location,
    p_agreed_partner_payment,
    p_other_delivery_cost,
    p_notes,
    p_hash_secret,
    p_token_expires_hours,
    p_require_pin,
    p_ip_address,
    p_user_agent
  );

  v_route_id := nullif(v_result #>> '{route,id}', '')::uuid;
  if v_route_id is null then
    raise exception 'route creation did not return a route id';
  end if;

  for v_package in
    select value from jsonb_array_elements(coalesce(p_packages, '[]'::jsonb))
  loop
    v_order_id := nullif(v_package ->> 'orderId', '')::integer;
    v_package_count := coalesce(nullif(v_package ->> 'packageCount', '')::integer, 1);

    if v_order_id is null or not (v_order_id = any(p_order_ids)) then
      raise exception 'invalid package order id';
    end if;
    if v_package_count < 1 or v_package_count > 50 then
      raise exception 'package count must be between 1 and 50';
    end if;

    update public.delivery_route_stops
    set package_count = v_package_count,
        updated_at = now()
    where route_id = v_route_id and order_id = v_order_id;
  end loop;

  return v_result;
end;
$$;

revoke execute on function public.create_delivery_route_with_packages_transaction(
  uuid, integer[], uuid, text, timestamptz, text, numeric, numeric, text,
  text, integer, boolean, text, text, jsonb
) from anon, authenticated, public;

grant execute on function public.create_delivery_route_with_packages_transaction(
  uuid, integer[], uuid, text, timestamptz, text, numeric, numeric, text,
  text, integer, boolean, text, text, jsonb
) to service_role;

;
