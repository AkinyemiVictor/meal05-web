create table public.markets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  country text not null,
  currency_code text not null,
  currency_symbol text,
  locale text not null default 'en',
  timezone text not null,
  status text not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint markets_status_valid check (status in ('active','coming_soon','inactive'))
);

comment on table public.markets is 'Country markets Meal05 operates in. Each carries its own currency, locale, and timezone. market_id on operational tables scopes data per market.';

create unique index markets_single_default on public.markets (is_default) where is_default;

alter table public.markets enable row level security;

create policy markets_public_read on public.markets
  for select to public
  using (true);

create policy markets_admin_all on public.markets
  for all to authenticated
  using (is_admin_user())
  with check (is_admin_user());

insert into public.markets (code, country, currency_code, currency_symbol, locale, timezone, status, is_default)
values ('NG', 'Nigeria', 'NGN', '₦', 'en-NG', 'Africa/Lagos', 'active', true);;
