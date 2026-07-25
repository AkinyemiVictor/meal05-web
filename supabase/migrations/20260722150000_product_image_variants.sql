-- Product image variants for lightweight storefront/mobile delivery.
-- Existing image_url remains the canonical/original fallback so old clients keep working.

alter table public.product_images
  add column if not exists thumb_url text,
  add column if not exists card_url text,
  add column if not exists detail_url text,
  add column if not exists original_url text,
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists normalized_at timestamptz;

comment on column public.product_images.thumb_url is
  'Small WebP thumbnail for compact previews, usually 200-300px.';

comment on column public.product_images.card_url is
  'Optimized WebP image for product cards/search grids, usually 480-640px.';

comment on column public.product_images.detail_url is
  'Optimized WebP image for product detail pages, usually 1000-1400px.';

comment on column public.product_images.original_url is
  'Original retained source image path or URL. Do not serve this in storefront grids.';

comment on column public.product_images.normalized_at is
  'Set when normalized image variants have been generated.';

create or replace view public.product_card_catalog
with (security_invoker = on) as
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
  (
    p.promo_tag_enabled
    and nullif(btrim(coalesce(p.promo_tag_text, '')), '') is not null
    and (p.promo_tag_expires_at is null or p.promo_tag_expires_at > now())
  ) as promo_tag_visible,
  chosen_variant.variant_id as default_variant_id,
  chosen_variant.variant_name as default_variant_name,
  chosen_variant.unit,
  chosen_variant.base_unit,
  chosen_variant.base_quantity,
  chosen_variant.purchase_mode,
  chosen_variant.min_quantity,
  chosen_variant.max_quantity,
  chosen_variant.step_quantity,
  chosen_variant.price as starting_price,
  chosen_variant.old_price,
  chosen_variant.stock_count,
  coalesce(chosen_variant.stock_count, 0) > 0 as in_stock,
  pm.market_id,
  m.code as market_code,
  m.country as market_country,
  coalesce(chosen_variant.currency_code, m.currency_code) as currency_code,
  m.currency_symbol,
  m.locale,
  m.timezone,
  p.created_at,
  p.updated_at,
  concat_ws(
    ' ',
    p.name,
    p.local_name,
    pm.local_name,
    p.search_keywords,
    c.name,
    c.slug,
    chosen_variant.variant_name,
    chosen_variant.unit
  ) as search_text,
  primary_image.thumb_url as thumb_image_url,
  primary_image.card_url as card_image_url,
  primary_image.detail_url as detail_image_url,
  primary_image.original_url as original_image_url
from public.product_markets pm
join public.markets m
  on m.id = pm.market_id
join public.products p
  on p.id = pm.product_id
left join public.product_categories c
  on c.id = p.category_id
left join lateral (
  select
    pi.image_url,
    pi.thumb_url,
    pi.card_url,
    pi.detail_url,
    pi.original_url
  from public.product_images pi
  where pi.product_id = p.id
  order by pi.is_primary desc, pi.position asc, pi.id asc
  limit 1
) primary_image on true
left join lateral (
  select
    v.id as variant_id,
    v.name as variant_name,
    v.unit,
    v.base_unit,
    v.base_quantity,
    v.purchase_mode,
    v.min_quantity,
    v.max_quantity,
    v.step_quantity,
    v.price,
    v.old_price,
    v.stock_count,
    v.currency_code
  from public.product_variants v
  where v.product_id = p.id
    and v.market_id = pm.market_id
    and v.is_active
  order by
    (coalesce(v.stock_count, 0) > 0) desc,
    v.is_default desc,
    v.price asc,
    v.id asc
  limit 1
) chosen_variant on true
where pm.is_listed
  and m.status = 'active'
  and p.is_active
  and coalesce(c.is_active, true);

grant select on table public.product_card_catalog to anon;
grant select on table public.product_card_catalog to authenticated;
grant select on table public.product_card_catalog to service_role;
