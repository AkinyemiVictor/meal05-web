insert into public.product_markets (
  product_id,
  market_id,
  local_name,
  is_listed
)
select
  p.id,
  m.id,
  'Rice - Simba',
  true
from public.products p
cross join public.markets m
where p.sku = 'SIMBA-RICE-1.5KG'
  and m.is_default = true
  and m.status = 'active'
on conflict (product_id, market_id) do update
set
  local_name = excluded.local_name,
  is_listed = true;;
