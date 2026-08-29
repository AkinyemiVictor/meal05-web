alter table public.product_variants
add column if not exists option_role text not null default 'standard';

alter table public.product_variants
drop constraint if exists product_variants_option_role_check;

alter table public.product_variants
add constraint product_variants_option_role_check
check (option_role in (
  'standard',
  'volume_saver',
  'manufacturer_pack',
  'size',
  'ripeness',
  'grade',
  'form'
));

comment on column public.product_variants.option_role is
'Classifies how a variant is presented and priced. volume_saver marks fixed bulk quantities whose unit cost is intended to be lower than the equivalent normal quantity.';

-- Establish a sensible baseline classification for existing variants.
update public.product_variants
set option_role = case
  when grade is not null then 'grade'
  when size is not null then 'size'
  when ripeness is not null then 'ripeness'
  when form is not null then 'form'
  else 'standard'
end;

-- Explicit bulk options discussed in the product sizing cycle.
update public.product_variants
set option_role = 'volume_saver'
where lower(name) in (
  'quarter bag',
  'half bag',
  'full bag',
  'half dozen',
  'one dozen',
  'half crate',
  'full crate',
  'crate of 30'
)
or lower(name) like '% — half dozen'
or lower(name) like '% — one dozen';

create index if not exists product_variants_option_role_idx
on public.product_variants(option_role);;
