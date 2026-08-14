create or replace view public.product_category_catalog_counts
with (security_invoker = on) as
select
  catalog.market_id,
  catalog.category_slug,
  count(*)::bigint as product_count,
  count(*) filter (where catalog.in_stock)::bigint as available_product_count
from public.product_card_catalog as catalog
where nullif(btrim(catalog.category_slug), '') is not null
group by catalog.market_id, catalog.category_slug;

comment on view public.product_category_catalog_counts is
  'Small market/category aggregate for catalogue navigation. Product, listing, category, variant, price and stock eligibility inherit from product_card_catalog.';

grant select on table public.product_category_catalog_counts to anon;
grant select on table public.product_category_catalog_counts to authenticated;
grant select on table public.product_category_catalog_counts to service_role;
