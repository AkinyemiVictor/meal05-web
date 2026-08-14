create or replace view public.product_card_catalog_with_options
with (security_invoker = on) as
select
  catalog.*,
  coalesce(options.variations, '[]'::jsonb) as variations
from public.product_card_catalog as catalog
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', variant.id,
      'product_id', variant.product_id,
      'name', variant.name,
      'unit', variant.unit,
      'price', variant.price,
      'old_price', variant.old_price,
      'stock_count', variant.stock_count,
      'size', variant.size,
      'size_label', variant.size_label,
      'display_label', variant.display_label,
      'ripeness', variant.ripeness,
      'base_unit', variant.base_unit,
      'base_quantity', variant.base_quantity,
      'is_default', variant.is_default,
      'is_active', variant.is_active,
      'weight_min', variant.weight_min,
      'weight_max', variant.weight_max,
      'weight_unit', variant.weight_unit,
      'volume_min', variant.volume_min,
      'volume_max', variant.volume_max,
      'volume_unit', variant.volume_unit,
      'market_id', variant.market_id,
      'currency_code', variant.currency_code,
      'purchase_mode', variant.purchase_mode,
      'min_quantity', variant.min_quantity,
      'max_quantity', variant.max_quantity,
      'step_quantity', variant.step_quantity,
      'option_role', variant.option_role
    )
    order by variant.id
  ) as variations
  from public.product_variants as variant
  where variant.product_id = catalog.product_id
    and variant.market_id = catalog.market_id
    and variant.is_active
    and variant.price > 0
) as options on true;

comment on view public.product_card_catalog_with_options is
  'Public product cards with their active purchasable options in one database response, avoiding a second catalogue round trip.';

grant select on table public.product_card_catalog_with_options to anon;
grant select on table public.product_card_catalog_with_options to authenticated;
grant select on table public.product_card_catalog_with_options to service_role;
