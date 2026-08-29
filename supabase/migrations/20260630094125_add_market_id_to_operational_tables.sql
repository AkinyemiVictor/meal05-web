create or replace function public.default_market_id() returns uuid
  language sql stable as $$ select id from public.markets where is_default limit 1 $$;

-- orders
alter table public.orders add column market_id uuid default public.default_market_id();
update public.orders set market_id = public.default_market_id() where market_id is null;
alter table public.orders add constraint orders_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.orders alter column market_id set not null;
create index orders_market_id_idx on public.orders (market_id);

-- deliveries
alter table public.deliveries add column market_id uuid default public.default_market_id();
update public.deliveries set market_id = public.default_market_id() where market_id is null;
alter table public.deliveries add constraint deliveries_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.deliveries alter column market_id set not null;
create index deliveries_market_id_idx on public.deliveries (market_id);

-- delivery_agents
alter table public.delivery_agents add column market_id uuid default public.default_market_id();
update public.delivery_agents set market_id = public.default_market_id() where market_id is null;
alter table public.delivery_agents add constraint delivery_agents_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.delivery_agents alter column market_id set not null;
create index delivery_agents_market_id_idx on public.delivery_agents (market_id);

-- delivery_zones
alter table public.delivery_zones add column market_id uuid default public.default_market_id();
update public.delivery_zones set market_id = public.default_market_id() where market_id is null;
alter table public.delivery_zones add constraint delivery_zones_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.delivery_zones alter column market_id set not null;
create index delivery_zones_market_id_idx on public.delivery_zones (market_id);

-- daily_menus
alter table public.daily_menus add column market_id uuid default public.default_market_id();
update public.daily_menus set market_id = public.default_market_id() where market_id is null;
alter table public.daily_menus add constraint daily_menus_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.daily_menus alter column market_id set not null;
create index daily_menus_market_id_idx on public.daily_menus (market_id);

-- suppliers
alter table public.suppliers add column market_id uuid default public.default_market_id();
update public.suppliers set market_id = public.default_market_id() where market_id is null;
alter table public.suppliers add constraint suppliers_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.suppliers alter column market_id set not null;
create index suppliers_market_id_idx on public.suppliers (market_id);

-- pickup_locations
alter table public.pickup_locations add column market_id uuid default public.default_market_id();
update public.pickup_locations set market_id = public.default_market_id() where market_id is null;
alter table public.pickup_locations add constraint pickup_locations_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.pickup_locations alter column market_id set not null;
create index pickup_locations_market_id_idx on public.pickup_locations (market_id);

-- promo_codes
alter table public.promo_codes add column market_id uuid default public.default_market_id();
update public.promo_codes set market_id = public.default_market_id() where market_id is null;
alter table public.promo_codes add constraint promo_codes_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.promo_codes alter column market_id set not null;
create index promo_codes_market_id_idx on public.promo_codes (market_id);

-- product_variants (Option A: variants are market-specific)
alter table public.product_variants add column market_id uuid default public.default_market_id();
update public.product_variants set market_id = public.default_market_id() where market_id is null;
alter table public.product_variants add constraint product_variants_market_id_fkey foreign key (market_id) references public.markets(id);
alter table public.product_variants alter column market_id set not null;
create index product_variants_market_id_idx on public.product_variants (market_id);;
