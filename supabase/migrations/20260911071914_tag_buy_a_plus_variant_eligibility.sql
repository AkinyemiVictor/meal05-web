-- Variant-level Tag Buy eligibility and shopper purchase mode.
-- The initial production allow-list is intentionally limited to A+ candidates.

alter table public.product_variants
  add column tag_buy_eligible boolean not null default false,
  add column tag_buy_purchase_mode text not null default 'dual',
  add column tag_buy_priority_tier text;

alter table public.product_variants
  add constraint product_variants_tag_buy_purchase_mode_check
    check (tag_buy_purchase_mode in ('dual', 'tag_only')),
  add constraint product_variants_tag_buy_priority_tier_check
    check (tag_buy_priority_tier is null or tag_buy_priority_tier in ('A+', 'A', 'B')),
  add constraint product_variants_tag_buy_metadata_check
    check (
      tag_buy_eligible
      or (tag_buy_purchase_mode = 'dual' and tag_buy_priority_tier is null)
    );

comment on column public.product_variants.tag_buy_eligible is
  'Operational allow-list for creating Tag Buy batches. Eligibility is variant-specific.';
comment on column public.product_variants.tag_buy_purchase_mode is
  'dual offers regular Buy Now and Tag Buy; tag_only suppresses regular purchase while a batch is open.';
comment on column public.product_variants.tag_buy_priority_tier is
  'Internal merchandising priority. The initial allow-list is limited to A+ candidates.';

alter table public.tag_batches
  add column purchase_mode text not null default 'dual';

alter table public.tag_batches
  add constraint tag_batches_purchase_mode_check
    check (purchase_mode in ('dual', 'tag_only')),
  add constraint tag_batches_discount_check
    check (tag_price < standard_price_at_open);

comment on column public.tag_batches.purchase_mode is
  'Snapshot of the shopper purchase choices for this batch: dual or tag_only.';

-- Eggs pool efficiently at pack/crate level. Single-egg options stay Buy Now only.
update public.product_variants pv
set tag_buy_eligible = true,
    tag_buy_purchase_mode = 'dual',
    tag_buy_priority_tier = 'A+'
from public.products p
where p.id = pv.product_id
  and p.sku in (
    'CHICKEN-EGGS-PULLET-SMALL',
    'CHICKEN-EGGS-MEDIUM',
    'CHICKEN-EGGS-JUMBO-LARGE'
  )
  and pv.name in ('1 Pack (6 Pieces)', 'Half Crate (15 Pieces)', '1 Crate (30 Pieces)');

-- Smaller potato quantities can combine into a market sack; existing bulk options
-- are already efficient normal purchases and are deliberately excluded.
update public.product_variants pv
set tag_buy_eligible = true,
    tag_buy_purchase_mode = 'dual',
    tag_buy_priority_tier = 'A+'
from public.products p
where p.id = pv.product_id
  and p.sku = 'SWEET-POTATO-100KG'
  and pv.name in ('1kg', '1 Paint Bucket (3.5kg)');

-- Beans pool from household sizes into a full market bag. Bag options remain
-- ordinary bulk purchases instead of competing with the pooled offer.
update public.product_variants pv
set tag_buy_eligible = true,
    tag_buy_purchase_mode = 'dual',
    tag_buy_priority_tier = 'A+'
from public.products p
where p.id = pv.product_id
  and p.sku = 'MAIDUGURI-HONEY-BEANS-OLOYIN-50KG'
  and pv.name in ('1kg', 'Half Paint Bucket (2kg)', '1 Paint Bucket (4kg)');

create or replace function public.enforce_tag_batch_variant_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_variant public.product_variants%rowtype;
begin
  select * into v_variant
  from public.product_variants
  where id = new.variant_id;

  if not found or v_variant.is_active is not true then
    raise exception 'Tag Buy requires an active product option';
  end if;
  if v_variant.product_id <> new.product_id or v_variant.market_id <> new.market_id then
    raise exception 'Tag Buy product, option, and market must match';
  end if;
  if v_variant.tag_buy_eligible is not true then
    raise exception 'This product option is not eligible for Tag Buy';
  end if;

  new.purchase_mode := v_variant.tag_buy_purchase_mode;
  return new;
end;
$$;

create trigger tag_batches_variant_eligibility
before insert or update of market_id, product_id, variant_id, purchase_mode, status
on public.tag_batches
for each row execute function public.enforce_tag_batch_variant_eligibility();

revoke all on function public.enforce_tag_batch_variant_eligibility()
  from public, anon, authenticated;
