-- Apply the September catalogue corrections requested for launch.
-- Product and variant rows are resolved by stable SKUs/names rather than generated IDs.
do $$
declare
  medium_plantain_id bigint;
  large_plantain_id bigint;
begin
  select p.id
    into medium_plantain_id
  from public.products p
  where p.name in ('Plantain', 'Plantain (Medium)', 'Plantain - Medium')
    and coalesce(p.sku, '') <> 'PLANTAIN-LARGE'
  order by p.is_active desc, p.id
  limit 1;

  select p.id
    into large_plantain_id
  from public.products p
  where p.sku = 'PLANTAIN-LARGE'
     or p.name in ('Plantain (Large)', 'Plantain - Large')
  order by (p.sku = 'PLANTAIN-LARGE') desc, p.id
  limit 1;

  if medium_plantain_id is null or large_plantain_id is null then
    raise exception 'Could not resolve both Medium and Large Plantain products';
  end if;

  update public.products
  set name = 'Plantain (Medium)',
      local_name = 'Plantain (Medium)',
      is_active = true,
      updated_at = now()
  where id = medium_plantain_id;

  update public.products target
  set name = 'Plantain (Large)',
      local_name = 'Plantain (Large)',
      is_active = true,
      description = source.description,
      storage_tips = source.storage_tips,
      handling_protocols = source.handling_protocols,
      main_image_url = source.main_image_url,
      updated_at = now()
  from public.products source
  where target.id = large_plantain_id
    and source.id = medium_plantain_id;

  update public.product_markets
  set local_name = 'Plantain (Medium)',
      is_listed = true
  where product_id = medium_plantain_id;

  update public.product_markets
  set local_name = 'Plantain (Large)',
      is_listed = true
  where product_id = large_plantain_id;

  update public.product_variants
  set is_active = true,
      availability_mode = 'standard',
      ripeness = null,
      display_label = name,
      is_default = (base_quantity = 6.5 and base_unit = 'finger'),
      updated_at = now()
  where product_id = large_plantain_id
    and name in ('6–7 Fingers', '6-7 Fingers', '10 Fingers', '1 Whole Bunch');

  -- Share the current corrected Plantain media with the new Large listing.
  update public.product_images target
  set image_url = source.image_url,
      original_url = source.original_url,
      thumb_url = source.thumb_url,
      card_url = source.card_url,
      detail_url = source.detail_url,
      image_width = source.image_width,
      image_height = source.image_height,
      normalized_at = source.normalized_at,
      alt_text = 'Plantain (Large)'
  from (
    select pi.*
    from public.product_images pi
    where pi.product_id = medium_plantain_id
      and pi.is_primary
    order by pi.position, pi.id
    limit 1
  ) source
  where target.product_id = large_plantain_id
    and target.is_primary;

  -- Obsolete Plantain choices can be deleted unless an order preserves them.
  delete from public.product_variants variant
  where variant.product_id in (medium_plantain_id, large_plantain_id)
    and not variant.is_active
    and not exists (
      select 1
      from public.order_items item
      where item.variant_id = variant.id
    );
end
$$;

-- Restore the Dates cup option.
update public.product_variants variant
set is_active = true,
    availability_mode = 'standard',
    stock_count = case when variant.stock_count > 0 then variant.stock_count else 10 end,
    updated_at = now()
from public.products product
where variant.product_id = product.id
  and product.name = 'Dates'
  and variant.name = '1 Cup (125g)';

-- Remove obsolete Habanero Pack/Loose source rows. Active fixed-size choices remain.
delete from public.product_variants variant
using public.products product
where variant.product_id = product.id
  and product.name = 'Habanero Pepper'
  and not variant.is_active
  and not exists (
    select 1 from public.order_items item where item.variant_id = variant.id
  );

-- Remove the retired Sweet Potato 500g and Ginger loose choices.
delete from public.product_variants variant
using public.products product
where variant.product_id = product.id
  and not variant.is_active
  and (
    (product.name = 'Sweet Potato' and variant.name = '500g')
    or (product.name = 'Ginger' and variant.purchase_mode = 'loose')
  )
  and not exists (
    select 1 from public.order_items item where item.variant_id = variant.id
  );

-- Remove the old Small/Big option pair from the Small Dried Ponmo listing.
delete from public.product_variants variant
using public.products product
where variant.product_id = product.id
  and product.name = 'Dried Ponmo - Small'
  and not variant.is_active
  and variant.name in ('Small', 'Big')
  and not exists (
    select 1 from public.order_items item where item.variant_id = variant.id
  );

-- Make Premium Ijebu Garri visibly out of stock without discarding future prices.
update public.product_variants variant
set stock_count = 0,
    availability_mode = 'unavailable',
    updated_at = now()
from public.products product
where variant.product_id = product.id
  and product.name = 'Premium Ijebu Garri'
  and variant.is_active;

-- Correct customer-facing product names.
update public.products
set name = 'Sardine - Sawa',
    local_name = 'Sardine - Sawa',
    updated_at = now()
where name in ('Sardine (Shawa)', 'Sardine - Sawa');

update public.product_markets market
set local_name = 'Sardine - Sawa'
from public.products product
where market.product_id = product.id
  and product.name = 'Sardine - Sawa';

update public.products
set name = 'Honey Beans (Oloyin)',
    local_name = 'Beans - Oloyin',
    updated_at = now()
where name in ('Maiduguri Honey Beans (Oloyin)', 'Honey Beans (Oloyin)');

update public.product_markets market
set local_name = 'Beans - Oloyin'
from public.products product
where market.product_id = product.id
  and product.name = 'Honey Beans (Oloyin)';

-- The variant name was already Bulb; align every visible option label with it.
update public.product_variants variant
set name = '1 Bulb',
    display_label = '1 Bulb',
    size = '1 Bulb',
    updated_at = now()
from public.products product
where variant.product_id = product.id
  and product.name = 'Garlic'
  and variant.name in ('1 Piece', '1 Bulb');

-- Devon is the brand prefix for every King's oil listing.
update public.products
set name = 'Devon ' || name,
    local_name = 'Devon ' || name,
    updated_at = now()
where name like 'King''s % Oil (%)';

update public.product_markets market
set local_name = product.name
from public.products product
where market.product_id = product.id
  and product.name like 'Devon King''s % Oil (%)';
