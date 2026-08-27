create or replace view public.products_cards_view as
select
  p.id as product_id,
  p.name as product_name,
  pc.name as category_name,
  pc.slug as category_slug,
  p.main_image_url,
  p.is_active,
  p.in_season,
  v.id as variant_id,
  v.name as variant_name,
  v.price,
  v.old_price,
  v.unit,
  v.stock_count,
  v.size_label
from public.products p
left join public.product_categories pc on pc.id = p.category_id
left join lateral (
  select pv.id, pv.name, pv.price, pv.old_price, pv.unit, pv.stock_count, pv.size_label
  from public.product_variants pv
  where pv.product_id = p.id
    and pv.is_active is distinct from false
  order by pv.is_default desc nulls last, pv.price asc nulls last, pv.id asc
  limit 1
) v on true
where p.is_active is distinct from false;;
