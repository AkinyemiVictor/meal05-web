alter table public.product_variants
  add column if not exists restocked_at timestamptz,
  add column if not exists last_restock_quantity numeric;

comment on column public.product_variants.restocked_at is
  'Timestamp of the most recent stock increase for this variant. Used to order Fresh In Stock products.';

comment on column public.product_variants.last_restock_quantity is
  'Quantity added during the most recent detected stock increase.';

with latest_restock as (
  select distinct on (sl.variant_id)
    sl.variant_id,
    sl.created_at as restocked_at,
    sl.change_qty as quantity
  from public.stock_ledger sl
  where sl.reason = 'restock'
    and sl.change_qty > 0
  order by sl.variant_id, sl.created_at desc, sl.id desc
)
update public.product_variants pv
set restocked_at = lr.restocked_at,
    last_restock_quantity = lr.quantity
from latest_restock lr
where pv.id = lr.variant_id
  and (pv.restocked_at is null or lr.restocked_at > pv.restocked_at);

create or replace function public.capture_variant_restock_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stock_count > old.stock_count then
    new.restocked_at := clock_timestamp();
    new.last_restock_quantity := new.stock_count - old.stock_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_variant_restock_timestamp on public.product_variants;
create trigger trg_capture_variant_restock_timestamp
before update of stock_count on public.product_variants
for each row
when (new.stock_count > old.stock_count)
execute function public.capture_variant_restock_timestamp();

create index if not exists idx_product_variants_fresh_stock
  on public.product_variants (market_id, restocked_at desc, product_id)
  where is_active = true
    and stock_count > 0
    and restocked_at is not null;;
