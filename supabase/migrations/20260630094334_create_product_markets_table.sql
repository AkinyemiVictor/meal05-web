create table public.product_markets (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  market_id  uuid   not null references public.markets(id) default public.default_market_id(),
  local_name text,
  is_listed  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, market_id)
);

comment on table public.product_markets is 'Per-market product listings. Controls which catalog products appear in each market, with optional per-market local_name override. local_name falls back to products.local_name then products.name.';

create index product_markets_market_listed_idx on public.product_markets (market_id, is_listed);

alter table public.product_markets enable row level security;

create policy product_markets_public_read on public.product_markets
  for select to public using (true);

create policy product_markets_admin_all on public.product_markets
  for all to authenticated
  using (is_admin_user()) with check (is_admin_user());

insert into public.product_markets (product_id, market_id, is_listed)
select p.id, public.default_market_id(), true from public.products p;
