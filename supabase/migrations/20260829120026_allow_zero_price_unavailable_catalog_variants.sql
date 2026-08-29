create or replace view public.product_card_catalog as
select
  p.id as product_id,
  coalesce(nullif(btrim(pm.local_name), ''), nullif(btrim(p.local_name), ''), p.name) as name,
  p.description,
  p.sku,
  p.category_id,
  c.name as category_name,
  c.slug as category_slug,
  coalesce(nullif(btrim(primary_image.card_url), ''), nullif(btrim(p.main_image_url), ''), primary_image.image_url) as main_image_url,
  p.is_active,
  coalesce(p.in_season, true) as in_season,
  p.search_keywords,
  p.sourcing_type,
  p.promo_tag_enabled,
  p.promo_tag_text,
  p.promo_tag_expires_at,
  (p.promo_tag_enabled and nullif(btrim(coalesce(p.promo_tag_text, '')), '') is not null and (p.promo_tag_expires_at is null or p.promo_tag_expires_at > now())) as promo_tag_visible,
  chosen_variant.variant_id as default_variant_id,
  chosen_variant.variant_name as default_variant_name,
  chosen_variant.unit,
  chosen_variant.base_unit,
  chosen_variant.base_quantity,
  chosen_variant.purchase_mode,
  chosen_variant.min_quantity,
  chosen_variant.max_quantity,
  chosen_variant.step_quantity,
  case when chosen_variant.availability_mode = 'unavailable' then 0::numeric(12,2) else chosen_variant.price end as starting_price,
  case when chosen_variant.availability_mode = 'unavailable' then null::numeric(12,2) else chosen_variant.old_price end as old_price,
  chosen_variant.stock_count,
  ((chosen_variant.availability_mode <> 'unavailable') and coalesce(chosen_variant.stock_count,0) > 0) as in_stock,
  pm.market_id,
  m.code as market_code,
  m.country as market_country,
  coalesce(chosen_variant.currency_code,m.currency_code) as currency_code,
  m.currency_symbol,
  m.locale,
  m.timezone,
  p.created_at,
  p.updated_at,
  concat_ws(' ',p.name,p.local_name,pm.local_name,p.search_keywords,c.name,c.slug,chosen_variant.variant_name,chosen_variant.unit) as search_text,
  primary_image.thumb_url as thumb_image_url,
  primary_image.card_url as card_image_url,
  primary_image.detail_url as detail_image_url,
  primary_image.original_url as original_image_url,
  chosen_variant.active_variant_count,
  p.display_group,
  p.display_group_order,
  case when nullif(btrim(p.display_group),'') is null then p.id * 100 else (min(p.id) over (partition by pm.market_id,p.display_group) * 100) + coalesce(p.display_group_order,99) end as display_sort_order
from product_markets pm
join markets m on m.id=pm.market_id
join products p on p.id=pm.product_id
left join product_categories c on c.id=p.category_id
left join lateral (
  select pi.image_url,pi.thumb_url,pi.card_url,pi.detail_url,pi.original_url
  from product_images pi
  where pi.product_id=p.id
  order by pi.is_primary desc,pi."position",pi.id
  limit 1
) primary_image on true
join lateral (
  select v.id as variant_id,v.name as variant_name,v.unit,v.base_unit,v.base_quantity,v.purchase_mode,v.min_quantity,v.max_quantity,v.step_quantity,v.price,v.old_price,v.stock_count,v.currency_code,v.availability_mode,(count(*) over ())::integer as active_variant_count
  from product_variants v
  where v.product_id=p.id
    and v.market_id=pm.market_id
    and v.is_active
    and (v.price > 0 or v.availability_mode='unavailable')
  order by (v.availability_mode <> 'unavailable') desc,(coalesce(v.stock_count,0)>0) desc,v.price,v.id
  limit 1
) chosen_variant on true
where pm.is_listed and m.status='active' and p.is_active and coalesce(c.is_active,true);

create or replace view public.product_card_catalog_with_options as
select
  catalog.product_id,catalog.name,catalog.description,catalog.sku,catalog.category_id,catalog.category_name,catalog.category_slug,catalog.main_image_url,catalog.is_active,catalog.in_season,catalog.search_keywords,catalog.sourcing_type,catalog.promo_tag_enabled,catalog.promo_tag_text,catalog.promo_tag_expires_at,catalog.promo_tag_visible,catalog.default_variant_id,catalog.default_variant_name,catalog.unit,catalog.base_unit,catalog.base_quantity,catalog.purchase_mode,catalog.min_quantity,catalog.max_quantity,catalog.step_quantity,catalog.starting_price,catalog.old_price,catalog.stock_count,catalog.in_stock,catalog.market_id,catalog.market_code,catalog.market_country,catalog.currency_code,catalog.currency_symbol,catalog.locale,catalog.timezone,catalog.created_at,catalog.updated_at,catalog.search_text,catalog.thumb_image_url,catalog.card_image_url,catalog.detail_image_url,catalog.original_image_url,catalog.active_variant_count,
  coalesce(options.variations,'[]'::jsonb) as variations,
  catalog.display_group,catalog.display_group_order,catalog.display_sort_order
from product_card_catalog catalog
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id',variant.id,
    'product_id',variant.product_id,
    'name',variant.name,
    'unit',variant.unit,
    'price',case when variant.availability_mode='unavailable' then 0::numeric(12,2) else variant.price end,
    'old_price',case when variant.availability_mode='unavailable' then null::numeric(12,2) else variant.old_price end,
    'stock_count',variant.stock_count,
    'size',variant.size,
    'size_label',variant.size_label,
    'display_label',variant.display_label,
    'ripeness',variant.ripeness,
    'base_unit',variant.base_unit,
    'base_quantity',variant.base_quantity,
    'is_default',variant.is_default,
    'is_active',variant.is_active,
    'weight_min',variant.weight_min,
    'weight_max',variant.weight_max,
    'weight_unit',variant.weight_unit,
    'volume_min',variant.volume_min,
    'volume_max',variant.volume_max,
    'volume_unit',variant.volume_unit,
    'market_id',variant.market_id,
    'currency_code',variant.currency_code,
    'purchase_mode',variant.purchase_mode,
    'min_quantity',variant.min_quantity,
    'max_quantity',variant.max_quantity,
    'step_quantity',variant.step_quantity,
    'option_role',variant.option_role,
    'availability_mode',variant.availability_mode,
    'inventory_tracking_mode',variant.inventory_tracking_mode
  ) order by variant.id) as variations
  from product_variants variant
  where variant.product_id=catalog.product_id
    and variant.market_id=catalog.market_id
    and variant.is_active
    and (variant.price > 0 or variant.availability_mode='unavailable')
) options on true;;
