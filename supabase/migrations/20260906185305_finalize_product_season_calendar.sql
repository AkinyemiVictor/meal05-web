create table if not exists public.product_season_profiles (
  product_id bigint primary key references public.products(id) on delete cascade,
  region_code text not null default 'ibadan_oyo_ng',
  basis text not null default 'market_availability',
  peak_months smallint[] not null default '{}',
  in_season_months smallint[] not null default '{}',
  shoulder_months smallint[] not null default '{}',
  year_round boolean not null default false,
  confidence text not null default 'medium',
  source_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_season_profiles_confidence_check
    check (confidence in ('high', 'medium', 'low'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_season_profiles'::regclass
      and conname = 'product_season_profiles_month_values_check'
  ) then
    alter table public.product_season_profiles
      add constraint product_season_profiles_month_values_check check (
        peak_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
        and in_season_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
        and shoulder_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_season_profiles'::regclass
      and conname = 'product_season_profiles_month_sets_check'
  ) then
    alter table public.product_season_profiles
      add constraint product_season_profiles_month_sets_check check (
        not (peak_months && in_season_months)
        and not (peak_months && shoulder_months)
        and not (in_season_months && shoulder_months)
      );
  end if;
end
$$;

with seed (
  product_name,
  region_code,
  basis,
  peak_months,
  in_season_months,
  shoulder_months,
  year_round,
  confidence,
  source_note,
  active
) as (
  values
    ('African Spinach (Efo Tete)', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Leafy greens can be produced year-round with adequate water; rainy season gives strongest local supply.', true),
    ('African Star Apple (Agbalumo)', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3]::smallint[], ARRAY[12, 4]::smallint[], ARRAY[5]::smallint[], false, 'high', 'Nigerian sources consistently place Agbalumo from December-April, sometimes extending into May.', true),
    ('Avocado', 'ibadan_oyo_ng', 'market_availability', ARRAY[7, 8]::smallint[], ARRAY[6, 9]::smallint[], ARRAY[5, 10]::smallint[], false, 'medium', 'Nigeria avocado timing varies by cultivar; July-August is a common local seasonal window, with adjacent months treated as transition.', true),
    ('Avocado (Hass)', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11]::smallint[], ARRAY[12]::smallint[], ARRAY[7]::smallint[], false, 'medium', 'Nigerian avocado guidance places Hass harvest roughly August-December.', true),
    ('Banana (Cavendish) - Large', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Banana (Cavendish) - Medium', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Banana (Cavendish) - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Bitter Leaf', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Perennial/continuously harvested leafy vegetable; strongest natural growth during rains.', true),
    ('Cashew', 'ibadan_oyo_ng', 'market_availability', ARRAY[2, 3, 4, 5]::smallint[], ARRAY[1, 6, 12]::smallint[], ARRAY[]::smallint[], false, 'high', 'Nigeria Export Promotion Council states cashew producing season runs December-June.', true),
    ('Cayenne Pepper (Sombo) - Grade A', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Derived-savannah pepper crop cycle and southwest continuous harvest place strongest supply in the second half of the year.', true),
    ('Cayenne Pepper (Sombo) - Grade B', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Derived-savannah pepper crop cycle and southwest continuous harvest place strongest supply in the second half of the year.', true),
    ('Coconut (Big)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Perennial tropical crop; Meal05 market supply is treated as year-round.', true),
    ('Coconut (Medium)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Perennial tropical crop; Meal05 market supply is treated as year-round.', true),
    ('Coconut (Small)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Perennial tropical crop; Meal05 market supply is treated as year-round.', true),
    ('Cucumber', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest production is possible in rainy and irrigated dry seasons; treat market supply as year-round.', true),
    ('Fluted Pumpkin Leaves (Ugu)', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Leafy greens can be produced year-round with adequate water; rainy season gives strongest local supply.', true),
    ('Fresh Tomato - Grade A', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 6, 7, 12]::smallint[], ARRAY[4, 5, 8]::smallint[], ARRAY[9, 10, 11]::smallint[], false, 'high', 'Ibadan/Oyo has early-rain harvest plus dry-season/irrigated cycles; northern dry-season supply also feeds Ibadan.', true),
    ('Fresh Tomato - Grade B', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 6, 7, 12]::smallint[], ARRAY[4, 5, 8]::smallint[], ARRAY[9, 10, 11]::smallint[], false, 'high', 'Ibadan/Oyo has early-rain harvest plus dry-season/irrigated cycles; northern dry-season supply also feeds Ibadan.', true),
    ('Garden Egg (Green)', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12]::smallint[], ARRAY[6, 7, 8, 9]::smallint[], ARRAY[4, 5]::smallint[], false, 'high', 'NSPRI reports garden-egg harvest concentrated June-December, with more respondents harvesting October-December.', true),
    ('Garden Egg (White)', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12]::smallint[], ARRAY[6, 7, 8, 9]::smallint[], ARRAY[4, 5]::smallint[], false, 'high', 'NSPRI reports garden-egg harvest concentrated June-December, with more respondents harvesting October-December.', true),
    ('German Mango', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6]::smallint[], ARRAY[3, 7]::smallint[], ARRAY[2]::smallint[], false, 'medium', 'Nigeria mango season broadly runs late February-July; southwest/Oyo abundance is strongest April-June.', true),
    ('Green Bell Pepper', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'medium', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Guava (White)', 'ibadan_oyo_ng', 'market_availability', ARRAY[5, 6]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Guava can fruit in multiple flushes; treat Ibadan market supply as year-round with a May-June abundance window.', true),
    ('Habanero Pepper', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'medium', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Jute Leaves (Ewedu) - Large', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Ewedu is a fast hot-season leafy vegetable; rain-fed production starts with the rains and irrigation extends supply.', true),
    ('Jute Leaves (Ewedu) - Medium', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Ewedu is a fast hot-season leafy vegetable; rain-fed production starts with the rains and irrigation extends supply.', true),
    ('Jute Leaves (Ewedu) - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Ewedu is a fast hot-season leafy vegetable; rain-fed production starts with the rains and irrigation extends supply.', true),
    ('Lagos Spinach (Efo Shoko) - Big', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Leafy greens can be produced year-round with adequate water; rainy season gives strongest local supply.', true),
    ('Lagos Spinach (Efo Shoko) - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Leafy greens can be produced year-round with adequate water; rainy season gives strongest local supply.', true),
    ('Lemon', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'low', 'Citrus supply to Ibadan is sourced across regions; treat retail availability as year-round pending stronger local month-level data.', true),
    ('Light Red Onions', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 4]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Major Nigerian bulb-onion dry-season harvest begins from January; storage and interregional trade support year-round market supply.', true),
    ('Lime', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'low', 'Citrus supply to Ibadan is sourced across regions; treat retail availability as year-round pending stronger local month-level data.', true),
    ('Maize (Corn)', 'ibadan_oyo_ng', 'market_availability', ARRAY[7, 8, 11, 12]::smallint[], ARRAY[6, 9, 10]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Oyo early and second-season harvest pattern; southern maize harvest generally June-August.', true),
    ('Ogbomosho Mango', 'ibadan_oyo_ng', 'market_availability', ARRAY[5, 6]::smallint[], ARRAY[4, 7]::smallint[], ARRAY[3]::smallint[], false, 'high', 'Ogbomosho/Oyo mango production is especially abundant in May-June, within the broader Nigeria mango season.', true),
    ('Okra', 'ibadan_oyo_ng', 'market_availability', ARRAY[6, 7, 8, 9, 10]::smallint[], ARRAY[5, 11]::smallint[], ARRAY[4, 12]::smallint[], false, 'high', 'Southwest research and Oyo calendars show early and late rainy-season okra harvests.', true),
    ('Orange - Semi-Ripe (Large)', 'ibadan_oyo_ng', 'market_availability', ARRAY[11, 12, 1, 2]::smallint[], ARRAY[3, 4, 9, 10]::smallint[], ARRAY[5, 8]::smallint[], false, 'medium', 'Ibadan/Nigeria citrus references indicate strongest orange supply from late rainy season through the dry season.', true),
    ('Orange - Semi-Ripe (Medium)', 'ibadan_oyo_ng', 'market_availability', ARRAY[11, 12, 1, 2]::smallint[], ARRAY[3, 4, 9, 10]::smallint[], ARRAY[5, 8]::smallint[], false, 'medium', 'Ibadan/Nigeria citrus references indicate strongest orange supply from late rainy season through the dry season.', true),
    ('Papaya (Pawpaw) - Unripe (Big)', 'ibadan_oyo_ng', 'market_availability', ARRAY[9, 10, 11]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigerian horticultural literature reports pawpaw fruit available year-round, peaking toward the end of the rainy season.', true),
    ('Papaya (Pawpaw) - Unripe (Medium)', 'ibadan_oyo_ng', 'market_availability', ARRAY[9, 10, 11]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigerian horticultural literature reports pawpaw fruit available year-round, peaking toward the end of the rainy season.', true),
    ('Papaya (Pawpaw) - Unripe (Small)', 'ibadan_oyo_ng', 'market_availability', ARRAY[9, 10, 11]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigerian horticultural literature reports pawpaw fruit available year-round, peaking toward the end of the rainy season.', true),
    ('Pawpaw (Solo Papaya)', 'ibadan_oyo_ng', 'market_availability', ARRAY[9, 10, 11]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigerian horticultural literature reports pawpaw fruit available year-round, peaking toward the end of the rainy season.', true),
    ('Pineapple - Semi-Ripe (Large)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest commercial pineapple production and staggered planting support year-round market supply.', true),
    ('Pineapple - Semi-Ripe (Medium)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest commercial pineapple production and staggered planting support year-round market supply.', true),
    ('Pineapple - Semi-Ripe (Small)', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest commercial pineapple production and staggered planting support year-round market supply.', true),
    ('Plantain - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Plantain (Large)', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Plantain (Medium)', 'ibadan_oyo_ng', 'market_availability', ARRAY[10, 11, 12, 1, 2]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Nigeria plantain/banana fruit is produced year-round, with major harvest and best quality commonly October-February.', true),
    ('Raw Shelled Groundnuts', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9]::smallint[], ARRAY[7, 10]::smallint[], ARRAY[6, 11]::smallint[], false, 'medium', 'Ibadan/Oyo rain-fed groundnut planted around April and harvested roughly 90-150 days later.', true),
    ('Red Bell Pepper (Tatase) - Grade A', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Red Bell Pepper (Tatase) - Grade B', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Red Onions', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 4]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Major Nigerian bulb-onion dry-season harvest begins from January; storage and interregional trade support year-round market supply.', true),
    ('Scent Leaf (Clove Basil)', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6]::smallint[], ARRAY[7, 8, 9, 10, 11, 12]::smallint[], ARRAY[3]::smallint[], false, 'high', 'NSPRI farmer survey reports most scent-leaf harvesting April-December and very little January-March.', true),
    ('Scotch Bonnet (Rodo) - Grade A', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Scotch Bonnet (Rodo) - Grade B', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11, 12]::smallint[], ARRAY[6, 7]::smallint[], ARRAY[1, 5]::smallint[], false, 'high', 'Pepper production is seasonal locally but supplemented by irrigated/northern supply.', true),
    ('Shallots', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 4]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Allium market supply is treated as year-round; dry-season bulb harvest is strongest early in the year.', true),
    ('Sheri Mango', 'ibadan_oyo_ng', 'market_availability', ARRAY[3, 4, 5]::smallint[], ARRAY[2]::smallint[], ARRAY[6]::smallint[], false, 'high', 'Published Nigerian variety references place Sheri/Sherry peak availability around February-May.', true),
    ('Snails - Big', 'ibadan_oyo_ng', 'market_availability', ARRAY[5, 6, 7, 8, 9, 10]::smallint[], ARRAY[4]::smallint[], ARRAY[11]::smallint[], false, 'high', 'Nigerian edible land-snail supply is much higher during the rainy season, roughly April-October, and scarce in the dry season.', true),
    ('Snails - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[5, 6, 7, 8, 9, 10]::smallint[], ARRAY[4]::smallint[], ARRAY[11]::smallint[], false, 'high', 'Nigerian edible land-snail supply is much higher during the rainy season, roughly April-October, and scarce in the dry season.', true),
    ('Soursop', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 4, 6, 7, 8]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Nigerian studies report two major fruiting periods, January-April and June-August, with some harvest outside those peaks.', true),
    ('Soya Beans', 'ibadan_oyo_ng', 'market_availability', ARRAY[11, 12]::smallint[], ARRAY[10, 1]::smallint[], ARRAY[9, 2]::smallint[], false, 'medium', 'Ibadan/Oyo soybean second-season planting is around July-August with harvest roughly 90-150 days later.', true),
    ('Spring Onion', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Short-cycle irrigated leafy allium; market availability is treated as year-round.', true),
    ('Sweet Potato', 'ibadan_oyo_ng', 'market_availability', ARRAY[9, 10, 11]::smallint[], ARRAY[7, 8, 12]::smallint[], ARRAY[6, 1]::smallint[], false, 'medium', 'Southwest planting commonly April-July; harvest follows roughly 3-5 months later.', true),
    ('Washed Carrots', 'ibadan_oyo_ng', 'market_availability', ARRAY[12, 1, 2, 3]::smallint[], ARRAY[11, 4]::smallint[], ARRAY[10, 5]::smallint[], false, 'medium', 'Nigeria carrot supply is strongest in the cool/dry production window, largely sourced from northern growing areas.', true),
    ('Waterleaf (Surinam Spinach)', 'ibadan_oyo_ng', 'market_availability', ARRAY[4, 5, 6, 7, 8, 9, 10]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'high', 'Moisture-loving leafy vegetable; irrigated/peri-urban production supports year-round supply.', true),
    ('Watermelon - Big', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest rain-fed and irrigated production windows overlap enough to treat Ibadan market supply as year-round.', true),
    ('Watermelon - Medium', 'ibadan_oyo_ng', 'market_availability', ARRAY[]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Southwest rain-fed and irrigated production windows overlap enough to treat Ibadan market supply as year-round.', true),
    ('White Onion', 'ibadan_oyo_ng', 'market_availability', ARRAY[1, 2, 3, 4]::smallint[], ARRAY[]::smallint[], ARRAY[]::smallint[], true, 'medium', 'Bulb-onion dry-season harvest is strongest early in the year; storage and interregional trade support year-round market supply.', true),
    ('White Yam (Mumuyi) - Big', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11]::smallint[], ARRAY[7, 12]::smallint[], ARRAY[1, 6]::smallint[], false, 'high', 'Oyo studies place main yam harvest August-November, with early yam beginning around June/July.', true),
    ('White Yam (Mumuyi) - Medium', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11]::smallint[], ARRAY[7, 12]::smallint[], ARRAY[1, 6]::smallint[], false, 'high', 'Oyo studies place main yam harvest August-November, with early yam beginning around June/July.', true),
    ('White Yam (Mumuyi) - Small', 'ibadan_oyo_ng', 'market_availability', ARRAY[8, 9, 10, 11]::smallint[], ARRAY[7, 12]::smallint[], ARRAY[1, 6]::smallint[], false, 'high', 'Oyo studies place main yam harvest August-November, with early yam beginning around June/July.', true)
)
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
  active,
  updated_at
)
select
  product.id,
  seed.region_code,
  seed.basis,
  seed.peak_months,
  seed.in_season_months,
  seed.shoulder_months,
  seed.year_round,
  seed.confidence,
  seed.source_note,
  seed.active,
  now()
from seed
join public.products as product on product.name = seed.product_name
on conflict (product_id) do update
set region_code = excluded.region_code,
    basis = excluded.basis,
    peak_months = excluded.peak_months,
    in_season_months = excluded.in_season_months,
    shoulder_months = excluded.shoulder_months,
    year_round = excluded.year_round,
    confidence = excluded.confidence,
    source_note = excluded.source_note,
    active = excluded.active,
    updated_at = now();

create or replace view public.product_season_calendar
with (security_invoker = true)
as
with months as (
  select generate_series(1, 12)::smallint as month_no
)
select
  profile.product_id,
  product.name as product_name,
  profile.region_code,
  month.month_no,
  to_char(make_date(2000, month.month_no, 1), 'Mon') as month_name,
  case
    when month.month_no = any(profile.peak_months) then 'peak'
    when profile.year_round then 'year_round'
    when month.month_no = any(profile.in_season_months) then 'in_season'
    when month.month_no = any(profile.shoulder_months) then 'shoulder'
    else 'out'
  end as season_status,
  profile.confidence,
  profile.source_note
from public.product_season_profiles as profile
join public.products as product on product.id = profile.product_id
cross join months as month
where profile.active;

create or replace view public.product_current_season
with (security_invoker = true)
as
select
  product_id,
  product_name,
  region_code,
  month_no,
  month_name,
  season_status,
  confidence,
  source_note
from public.product_season_calendar
where month_no = extract(month from timezone('Africa/Lagos', now()))::integer;

create or replace function public.refresh_product_season_flags()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  unmanaged_count integer := 0;
  managed_count integer := 0;
begin
  update public.products as product
  set in_season = false,
      updated_at = now()
  where product.in_season is distinct from false
    and not exists (
      select 1
      from public.product_season_profiles as profile
      where profile.product_id = product.id
        and profile.active
    );

  get diagnostics unmanaged_count = row_count;

  update public.products as product
  set in_season = current.season_status in ('peak', 'in_season', 'year_round'),
      updated_at = now()
  from public.product_current_season as current
  where product.id = current.product_id
    and product.in_season is distinct from
      (current.season_status in ('peak', 'in_season', 'year_round'));

  get diagnostics managed_count = row_count;
  return unmanaged_count + managed_count;
end;
$$;

alter table public.product_season_profiles enable row level security;

revoke all on table public.product_season_profiles from public, anon, authenticated;
revoke all on table public.product_season_calendar from public, anon, authenticated;
revoke all on table public.product_current_season from public, anon, authenticated;
revoke all on function public.refresh_product_season_flags() from public, anon, authenticated;

grant all on table public.product_season_profiles to service_role;
grant select on table public.product_season_calendar to service_role;
grant select on table public.product_current_season to service_role;
grant execute on function public.refresh_product_season_flags() to service_role;

select public.refresh_product_season_flags();

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh_meal05_product_seasons';

select cron.schedule(
  'refresh_meal05_product_seasons',
  '10 0 * * *',
  'select public.refresh_product_season_flags();'
);

comment on table public.product_season_profiles is
  'Ibadan/Oyo market-availability season rules. Actual daily stock remains independent.';
comment on view public.product_season_calendar is
  'January-to-December expected market season for calendar-managed Meal05 products.';
comment on view public.product_current_season is
  'Current Ibadan month status for calendar-managed Meal05 products.';
comment on function public.refresh_product_season_flags() is
  'Server-only daily refresh of product in_season flags from the Ibadan calendar.';
