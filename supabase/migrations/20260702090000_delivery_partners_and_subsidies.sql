-- Keep repository history aligned with the live multi-partner delivery model.
update public.delivery_zones set delivery_fee = 0 where name = 'Akala Express Launch Zone';

create table if not exists public.delivery_partners (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  logo_url text, status text not null default 'draft' check (status in ('draft','active','inactive')),
  contact_phone text, contact_email text,
  integration_type text not null default 'manual' check (integration_type in ('manual','api')),
  notes text, market_id uuid not null default public.default_market_id() references public.markets(id),
  created_at timestamptz not null default now()
);
create table if not exists public.delivery_partner_services (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  zone_id bigint not null references public.delivery_zones(id) on delete cascade,
  pricing_method text not null default 'flat' check (pricing_method in ('flat','per_km')),
  base_fee numeric not null check (base_fee >= 0), currency_code text not null default 'NGN',
  eta_note text, ranking integer not null default 100, is_recommended boolean not null default false,
  is_active boolean not null default true, created_at timestamptz not null default now(),
  unique (partner_id, zone_id)
);
alter table public.orders
  add column if not exists delivery_partner_id uuid references public.delivery_partners(id) on delete set null,
  add column if not exists partner_cost numeric,
  add column if not exists delivery_subsidy numeric;
alter table public.deliveries
  add column if not exists delivery_partner_id uuid references public.delivery_partners(id) on delete set null;
alter table public.delivery_partners enable row level security;
alter table public.delivery_partner_services enable row level security;
drop policy if exists delivery_partners_public_active on public.delivery_partners;
create policy delivery_partners_public_active on public.delivery_partners for select to public using (status = 'active');
drop policy if exists delivery_partner_services_public_active on public.delivery_partner_services;
create policy delivery_partner_services_public_active on public.delivery_partner_services for select to public using (is_active = true);
drop policy if exists delivery_partners_admin_all on public.delivery_partners;
create policy delivery_partners_admin_all on public.delivery_partners for all to authenticated using (is_admin_user()) with check (is_admin_user());
drop policy if exists delivery_partner_services_admin_all on public.delivery_partner_services;
create policy delivery_partner_services_admin_all on public.delivery_partner_services for all to authenticated using (is_admin_user()) with check (is_admin_user());
notify pgrst, 'reload schema';
