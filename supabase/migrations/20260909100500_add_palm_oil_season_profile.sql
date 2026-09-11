insert into public.product_season_profiles (
  product_id,
  region_code,
  basis,
  peak_months,
  in_season_months,
  shoulder_months,
  year_round,
  confidence,
  source_note,
  active
)
select
  product.id,
  'ibadan_oyo_ng',
  'market_availability_and_price',
  array[3, 4, 5, 6, 7]::smallint[],
  array[]::smallint[],
  array[1, 2, 8, 9]::smallint[],
  false,
  'high',
  'Nigeria palm-oil price studies identify March-July as the lower-price/high-supply period, August-September as price recovery, October-December as the high-price/lean period, and January-February as transition. FAO West African harvest distributions also show year-round output with pronounced monthly variation.',
  true
from public.products as product
where lower(btrim(product.name)) = lower('Farmer''s Palm Oil')
on conflict (product_id) do update
set
  basis = excluded.basis,
  peak_months = excluded.peak_months,
  in_season_months = excluded.in_season_months,
  shoulder_months = excluded.shoulder_months,
  year_round = excluded.year_round,
  confidence = excluded.confidence,
  source_note = excluded.source_note,
  active = excluded.active,
  updated_at = now();

select public.refresh_product_season_flags();
