-- Meal05 delivery management phase 1.
-- Scope: role migration, dispatch routes/stops, secure rider links, OTP confirmation,
-- audit logging, and future live-location readiness. No live GPS or internal chat.

create extension if not exists pgcrypto;

-- Normalize existing roles into the phase-1 role model before adding the constraint.
update public.users set role = 'super_admin' where role = 'superadmin';
update public.users set role = 'rider' where role = 'driver';
update public.users set role = 'dispatcher' where role in ('staff', 'warehouse');
update public.users set role = 'customer' where role is null or role not in ('customer', 'rider', 'dispatcher', 'admin', 'super_admin');

alter table public.users
  alter column role set default 'customer',
  alter column role set not null;

alter table public.users drop constraint if exists users_role_supported_check;
alter table public.users
  add constraint users_role_supported_check
  check (role in ('customer', 'rider', 'dispatcher', 'admin', 'super_admin'));

comment on column public.users.role is 'Access role: customer, rider, dispatcher, admin, or super_admin. Single source of truth for app authorization.';

-- Compatibility view for the requested profile shape. The existing users table remains
-- the source of truth to avoid a duplicate profile/role system.
create or replace view public.profiles
with (security_invoker = on) as
select
  auth_id as user_id,
  coalesce(nullif(name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, ''))) as full_name,
  phone,
  role,
  is_active,
  created_at,
  updated_at
from public.users
where auth_id is not null;

comment on view public.profiles is 'Compatibility profile view backed by public.users. public.users remains the profile and role source of truth.';

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.role from public.users u where u.auth_id = auth.uid() and u.is_active = true limit 1),
    'customer'
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'super_admin', 'superadmin')
  );
$$;

create or replace function public.is_dispatcher_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and u.is_active = true
      and u.role in ('dispatcher', 'admin', 'super_admin', 'superadmin')
  );
$$;

create or replace function public.is_super_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and u.is_active = true
      and u.role in ('super_admin', 'superadmin')
  );
$$;

drop function if exists public.assign_role(uuid, text);

create function public.assign_role(user_id uuid, role_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text := lower(trim(coalesce(role_name, '')));
begin
  if normalized_role = 'superadmin' then
    normalized_role := 'super_admin';
  elsif normalized_role = 'driver' then
    normalized_role := 'rider';
  elsif normalized_role in ('staff', 'warehouse') then
    normalized_role := 'dispatcher';
  end if;

  if normalized_role not in ('customer', 'rider', 'dispatcher', 'admin', 'super_admin') then
    raise exception 'invalid role: %', role_name;
  end if;

  update public.users
  set role = normalized_role, updated_at = now()
  where id = user_id or auth_id = user_id;

  if not found then
    raise exception 'user not found';
  end if;

  return jsonb_build_object('ok', true, 'role', normalized_role);
end;
$$;

revoke execute on function public.assign_role(uuid, text) from anon, authenticated, public;
grant execute on function public.assign_role(uuid, text) to service_role;

-- Extend the existing delivery_partners table rather than creating a duplicate.
alter table public.delivery_partners
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists vehicle_type text,
  add column if not exists vehicle_registration text,
  add column if not exists vehicle_plate_number text,
  add column if not exists vehicle_description text,
  add column if not exists government_id_type text,
  add column if not exists government_id_reference text,
  add column if not exists guarantor_name text,
  add column if not exists guarantor_phone text,
  add column if not exists operating_area text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists technology_level text not null default 'basic_smartphone',
  add column if not exists updated_at timestamptz not null default now();

update public.delivery_partners
set
  full_name = coalesce(full_name, name),
  phone = coalesce(phone, contact_phone),
  email = coalesce(email, contact_email),
  vehicle_type = coalesce(vehicle_type, 'motorcycle')
where full_name is null or phone is null or email is null or vehicle_type is null;

alter table public.delivery_partners drop constraint if exists delivery_partners_vehicle_type_check;
alter table public.delivery_partners
  add constraint delivery_partners_vehicle_type_check
  check (vehicle_type is null or vehicle_type in ('motorcycle', 'napep', 'korope', 'car', 'van', 'other'));

alter table public.delivery_partners drop constraint if exists delivery_partners_technology_level_check;
alter table public.delivery_partners
  add constraint delivery_partners_technology_level_check
  check (technology_level in ('manual_assisted', 'basic_smartphone', 'advanced'));

create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  route_code text unique not null default ('M05-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  delivery_partner_id uuid null references public.delivery_partners(id) on delete set null,
  status text not null default 'draft',
  vehicle_type text null,
  planned_start_time timestamptz null,
  actual_start_time timestamptz null,
  completed_at timestamptz null,
  pickup_location text null,
  pickup_latitude numeric null,
  pickup_longitude numeric null,
  agreed_partner_payment numeric(12,2) null,
  delivery_fees_collected numeric(12,2) not null default 0,
  other_delivery_cost numeric(12,2) not null default 0,
  delivery_margin numeric(12,2) generated always as (
    delivery_fees_collected - coalesce(agreed_partner_payment, 0) - other_delivery_cost
  ) stored,
  payment_status text not null default 'pending',
  payment_reference text null,
  payment_date timestamptz null,
  payment_approved_by uuid null references auth.users(id),
  notes text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_routes_status_check check (status in ('draft', 'ready', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'failed')),
  constraint delivery_routes_vehicle_type_check check (vehicle_type is null or vehicle_type in ('motorcycle', 'napep', 'korope', 'car', 'van', 'other')),
  constraint delivery_routes_payment_status_check check (payment_status in ('pending', 'approved', 'paid', 'disputed', 'cancelled'))
);

create table if not exists public.delivery_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  order_id integer not null references public.orders(id),
  stop_number integer not null,
  customer_id uuid null references auth.users(id),
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_landmark text null,
  delivery_latitude numeric null,
  delivery_longitude numeric null,
  delivery_window_start timestamptz null,
  delivery_window_end timestamptz null,
  status text not null default 'pending',
  arrived_at timestamptz null,
  delivered_at timestamptz null,
  failed_at timestamptz null,
  failure_reason text null,
  recipient_type text null,
  recipient_name text null,
  delivery_otp_hash text null,
  otp_expires_at timestamptz null,
  otp_attempt_count integer not null default 0,
  otp_verified_at timestamptz null,
  proof_photo_path text null,
  delivery_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(route_id, stop_number),
  constraint delivery_route_stops_status_check check (status in ('pending', 'next', 'en_route', 'arrived', 'delivered', 'failed', 'returned', 'skipped')),
  constraint delivery_route_stops_recipient_type_check check (recipient_type is null or recipient_type in ('customer', 'family_member', 'security', 'staff', 'other')),
  constraint delivery_route_stops_failure_reason_check check (failure_reason is null or failure_reason in ('customer_unavailable', 'wrong_address', 'customer_refused', 'vehicle_issue', 'package_damaged', 'unsafe_location', 'unable_to_contact_customer', 'other')),
  constraint delivery_route_stops_stop_number_check check (stop_number > 0),
  constraint delivery_route_stops_otp_attempt_count_check check (otp_attempt_count >= 0)
);

create table if not exists public.delivery_access_tokens (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  delivery_partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  token_hash text unique not null,
  pin_hash text null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_audit_logs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid null references public.delivery_routes(id),
  route_stop_id uuid null references public.delivery_route_stops(id),
  order_id integer null references public.orders(id),
  actor_user_id uuid null references auth.users(id),
  actor_type text not null,
  action text not null,
  old_value jsonb null,
  new_value jsonb null,
  reason text null,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_current_locations (
  route_id uuid primary key references public.delivery_routes(id) on delete cascade,
  delivery_partner_id uuid not null references public.delivery_partners(id),
  latitude numeric not null,
  longitude numeric not null,
  accuracy numeric null,
  heading numeric null,
  speed numeric null,
  recorded_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('delivery-proof-photos', 'delivery-proof-photos', false)
on conflict (id) do update set public = false;

create index if not exists delivery_routes_delivery_partner_id_idx on public.delivery_routes(delivery_partner_id);
create index if not exists delivery_routes_status_idx on public.delivery_routes(status);
create index if not exists delivery_routes_created_at_idx on public.delivery_routes(created_at desc);
create index if not exists delivery_route_stops_route_id_idx on public.delivery_route_stops(route_id);
create index if not exists delivery_route_stops_order_id_idx on public.delivery_route_stops(order_id);
create index if not exists delivery_route_stops_status_idx on public.delivery_route_stops(status);
create index if not exists delivery_route_stops_customer_id_idx on public.delivery_route_stops(customer_id);
create index if not exists delivery_access_tokens_route_id_idx on public.delivery_access_tokens(route_id);
create index if not exists delivery_access_tokens_expires_at_idx on public.delivery_access_tokens(expires_at);
create index if not exists delivery_audit_logs_route_id_idx on public.delivery_audit_logs(route_id);
create index if not exists delivery_audit_logs_order_id_idx on public.delivery_audit_logs(order_id);

alter table public.delivery_routes enable row level security;
alter table public.delivery_route_stops enable row level security;
alter table public.delivery_access_tokens enable row level security;
alter table public.delivery_audit_logs enable row level security;
alter table public.rider_current_locations enable row level security;

drop policy if exists delivery_routes_dispatcher_all on public.delivery_routes;
create policy delivery_routes_dispatcher_all on public.delivery_routes
  for all to authenticated using (public.is_dispatcher_user()) with check (public.is_dispatcher_user());

drop policy if exists delivery_routes_rider_read_assigned on public.delivery_routes;
create policy delivery_routes_rider_read_assigned on public.delivery_routes
  for select to authenticated using (
    exists (
      select 1
      from public.delivery_partners p
      where p.id = delivery_routes.delivery_partner_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  );

drop policy if exists delivery_route_stops_dispatcher_all on public.delivery_route_stops;
create policy delivery_route_stops_dispatcher_all on public.delivery_route_stops
  for all to authenticated using (public.is_dispatcher_user()) with check (public.is_dispatcher_user());

drop policy if exists delivery_route_stops_customer_read_own on public.delivery_route_stops;
create policy delivery_route_stops_customer_read_own on public.delivery_route_stops
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists delivery_route_stops_rider_read_assigned on public.delivery_route_stops;
create policy delivery_route_stops_rider_read_assigned on public.delivery_route_stops
  for select to authenticated using (
    exists (
      select 1
      from public.delivery_routes r
      join public.delivery_partners p on p.id = r.delivery_partner_id
      where r.id = delivery_route_stops.route_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  );

drop policy if exists delivery_access_tokens_dispatcher_all on public.delivery_access_tokens;
create policy delivery_access_tokens_dispatcher_all on public.delivery_access_tokens
  for all to authenticated using (public.is_dispatcher_user()) with check (public.is_dispatcher_user());

drop policy if exists delivery_audit_logs_dispatcher_read on public.delivery_audit_logs;
create policy delivery_audit_logs_dispatcher_read on public.delivery_audit_logs
  for select to authenticated using (public.is_dispatcher_user());

drop policy if exists rider_current_locations_dispatcher_read on public.rider_current_locations;
create policy rider_current_locations_dispatcher_read on public.rider_current_locations
  for select to authenticated using (public.is_dispatcher_user());

drop policy if exists rider_current_locations_rider_assigned on public.rider_current_locations;
create policy rider_current_locations_rider_assigned on public.rider_current_locations
  for all to authenticated using (
    exists (
      select 1
      from public.delivery_partners p
      where p.id = rider_current_locations.delivery_partner_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  ) with check (
    exists (
      select 1
      from public.delivery_partners p
      where p.id = rider_current_locations.delivery_partner_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  );

notify pgrst, 'reload schema';
