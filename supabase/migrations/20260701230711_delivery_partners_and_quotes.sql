update public.delivery_zones set delivery_fee = 0 where name = 'Akala Express Launch Zone';

create table public.delivery_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  contact_phone text,
  contact_email text,
  integration_type text not null default 'manual' check (integration_type in ('manual','api')),
  notes text,
  market_id uuid not null references public.markets(id) default public.default_market_id(),
  created_at timestamptz not null default now()
);

comment on table public.delivery_partners is 'Third-party delivery companies. status=draft keeps a partner configured but hidden from customers until confirmed.';

alter table public.delivery_partners enable row level security;
create policy delivery_partners_public_read on public.delivery_partners
  for select to public using (status = 'active');
create policy delivery_partners_admin_all on public.delivery_partners
  for all to authenticated using (is_admin_user()) with check (is_admin_user());

create table public.delivery_partner_services (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  zone_id bigint not null references public.delivery_zones(id) on delete cascade,
  pricing_method text not null default 'flat' check (pricing_method in ('flat','per_km')),
  base_fee numeric not null,
  currency_code text not null default 'NGN',
  eta_note text,
  ranking integer not null default 100,
  is_recommended boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (partner_id, zone_id)
);

comment on table public.delivery_partner_services is 'Per-partner, per-zone delivery quotes: fee, ETA, ranking, and the Recommended badge. Checkout must read fees from here server-side and snapshot onto the order.';

create index delivery_partner_services_zone_idx
  on public.delivery_partner_services (zone_id, is_active, ranking);

alter table public.delivery_partner_services enable row level security;
create policy delivery_partner_services_public_read on public.delivery_partner_services
  for select to public using (
    is_active = true
    and exists (select 1 from public.delivery_partners p where p.id = partner_id and p.status = 'active')
  );
create policy delivery_partner_services_admin_all on public.delivery_partner_services
  for all to authenticated using (is_admin_user()) with check (is_admin_user());

alter table public.orders
  add column delivery_partner_id uuid references public.delivery_partners(id) on delete set null,
  add column partner_cost numeric,
  add column delivery_subsidy numeric;

comment on column public.orders.delivery_fee is 'Amount charged to the customer for delivery (snapshot at checkout).';
comment on column public.orders.partner_cost is 'Actual amount the delivery partner charges Meal05 for this order (snapshot).';
comment on column public.orders.delivery_subsidy is 'Amount Meal05 absorbs (partner_cost minus delivery_fee), e.g. free-first-delivery promos.';

alter table public.deliveries
  add column delivery_partner_id uuid references public.delivery_partners(id) on delete set null;
