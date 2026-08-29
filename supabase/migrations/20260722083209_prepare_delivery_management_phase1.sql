create extension if not exists pgcrypto;

-- Extend the existing delivery partner catalogue so it can also represent
-- independently contracted riders/drivers without replacing existing records.
alter table public.delivery_partners
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists full_name text null,
  add column if not exists phone text null,
  add column if not exists email text null,
  add column if not exists vehicle_type text null,
  add column if not exists vehicle_registration text null,
  add column if not exists vehicle_plate_number text null,
  add column if not exists vehicle_description text null,
  add column if not exists government_id_type text null,
  add column if not exists government_id_reference text null,
  add column if not exists guarantor_name text null,
  add column if not exists guarantor_phone text null,
  add column if not exists operating_area text null,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists technology_level text not null default 'basic_smartphone',
  add column if not exists updated_at timestamptz not null default now();

update public.delivery_partners
set full_name = coalesce(full_name, name),
    phone = coalesce(phone, contact_phone),
    email = coalesce(email, contact_email)
where full_name is null or phone is null or email is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_partners'::regclass
      and conname = 'delivery_partners_vehicle_type_check'
  ) then
    alter table public.delivery_partners
      add constraint delivery_partners_vehicle_type_check
      check (vehicle_type is null or vehicle_type in ('motorcycle','napep','korope','car','van','other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_partners'::regclass
      and conname = 'delivery_partners_technology_level_check'
  ) then
    alter table public.delivery_partners
      add constraint delivery_partners_technology_level_check
      check (technology_level in ('manual_assisted','basic_smartphone','advanced'));
  end if;
end $$;

create unique index if not exists delivery_partners_user_id_uidx
  on public.delivery_partners(user_id)
  where user_id is not null;

create index if not exists delivery_partners_active_vehicle_idx
  on public.delivery_partners(is_active, vehicle_type)
  where is_active = true;

create or replace function public.generate_delivery_route_code()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select 'M05-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

revoke execute on function public.generate_delivery_route_code() from public, anon, authenticated;
grant execute on function public.generate_delivery_route_code() to service_role;

create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  route_code text not null unique default public.generate_delivery_route_code(),
  delivery_partner_id uuid null references public.delivery_partners(id) on delete restrict,
  status text not null default 'draft',
  vehicle_type text null,
  planned_start_time timestamptz null,
  actual_start_time timestamptz null,
  completed_at timestamptz null,
  pickup_location text null,
  pickup_latitude double precision null,
  pickup_longitude double precision null,
  agreed_partner_payment numeric(12,2) null,
  delivery_fees_collected numeric(12,2) not null default 0,
  other_delivery_cost numeric(12,2) not null default 0,
  delivery_margin numeric(12,2) generated always as (
    delivery_fees_collected - coalesce(agreed_partner_payment, 0) - other_delivery_cost
  ) stored,
  payment_status text not null default 'pending',
  payment_reference text null,
  payment_date timestamptz null,
  payment_approved_by uuid null references auth.users(id) on delete set null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_routes_status_check check (status in ('draft','ready','assigned','accepted','in_progress','completed','cancelled','failed')),
  constraint delivery_routes_vehicle_type_check check (vehicle_type is null or vehicle_type in ('motorcycle','napep','korope','car','van','other')),
  constraint delivery_routes_payment_status_check check (payment_status in ('pending','approved','paid','disputed','cancelled')),
  constraint delivery_routes_nonnegative_costs_check check (
    coalesce(agreed_partner_payment,0) >= 0 and delivery_fees_collected >= 0 and other_delivery_cost >= 0
  )
);

create table if not exists public.delivery_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  order_id integer not null references public.orders(id) on delete restrict,
  stop_number integer not null,
  customer_id uuid null references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_landmark text null,
  delivery_latitude double precision null,
  delivery_longitude double precision null,
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
  otp_verified_at timestamptz null,
  otp_attempt_count integer not null default 0,
  proof_photo_path text null,
  proof_photo_url text null,
  delivery_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_route_stops_route_stop_unique unique(route_id, stop_number),
  constraint delivery_route_stops_order_unique unique(order_id),
  constraint delivery_route_stops_stop_number_check check (stop_number > 0),
  constraint delivery_route_stops_status_check check (status in ('pending','next','en_route','arrived','delivered','failed','returned','skipped')),
  constraint delivery_route_stops_recipient_type_check check (recipient_type is null or recipient_type in ('customer','family_member','security','staff','other')),
  constraint delivery_route_stops_failure_reason_check check (failure_reason is null or failure_reason in ('customer_unavailable','wrong_address','customer_refused','vehicle_issue','package_damaged','unsafe_location','unable_to_contact_customer','other')),
  constraint delivery_route_stops_otp_attempt_check check (otp_attempt_count >= 0)
);

create table if not exists public.delivery_access_tokens (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  delivery_partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  token_hash text not null unique,
  pin_hash text null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_audit_logs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid null references public.delivery_routes(id) on delete set null,
  route_stop_id uuid null references public.delivery_route_stops(id) on delete set null,
  order_id integer null references public.orders(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
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
  delivery_partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision null,
  heading double precision null,
  speed double precision null,
  recorded_at timestamptz not null default now(),
  constraint rider_current_locations_latitude_check check (latitude between -90 and 90),
  constraint rider_current_locations_longitude_check check (longitude between -180 and 180)
);

create index if not exists delivery_routes_partner_idx on public.delivery_routes(delivery_partner_id);
create index if not exists delivery_routes_status_created_idx on public.delivery_routes(status, created_at desc);
create index if not exists delivery_route_stops_route_idx on public.delivery_route_stops(route_id, stop_number);
create index if not exists delivery_route_stops_status_idx on public.delivery_route_stops(status);
create index if not exists delivery_route_stops_customer_idx on public.delivery_route_stops(customer_id);
create index if not exists delivery_access_tokens_route_idx on public.delivery_access_tokens(route_id);
create index if not exists delivery_access_tokens_expiry_idx on public.delivery_access_tokens(expires_at) where revoked_at is null;
create index if not exists delivery_audit_logs_route_idx on public.delivery_audit_logs(route_id, created_at desc);
create index if not exists delivery_audit_logs_order_idx on public.delivery_audit_logs(order_id, created_at desc);

alter table public.delivery_routes enable row level security;
alter table public.delivery_route_stops enable row level security;
alter table public.delivery_access_tokens enable row level security;
alter table public.delivery_audit_logs enable row level security;
alter table public.rider_current_locations enable row level security;

-- These tables are intentionally server-only in Phase 1. The application uses
-- trusted server routes with the service role, so no anon/authenticated grants
-- or broad RLS policies are created here.
revoke all on table public.delivery_routes from anon, authenticated;
revoke all on table public.delivery_route_stops from anon, authenticated;
revoke all on table public.delivery_access_tokens from anon, authenticated;
revoke all on table public.delivery_audit_logs from anon, authenticated;
revoke all on table public.rider_current_locations from anon, authenticated;

grant all on table public.delivery_routes to service_role;
grant all on table public.delivery_route_stops to service_role;
grant all on table public.delivery_access_tokens to service_role;
grant all on table public.delivery_audit_logs to service_role;
grant all on table public.rider_current_locations to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proof',
  'delivery-proof',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';;
