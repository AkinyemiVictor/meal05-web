alter table public.order_items
  add column if not exists supplier_id bigint null references public.suppliers(id) on delete set null,
  add column if not exists supplier_unit_cost numeric null,
  add column if not exists supplier_cost_source text null;

alter table public.order_items
  drop constraint if exists order_items_supplier_unit_cost_check,
  add constraint order_items_supplier_unit_cost_check
    check (supplier_unit_cost is null or supplier_unit_cost >= 0),
  drop constraint if exists order_items_supplier_cost_source_check,
  add constraint order_items_supplier_cost_source_check
    check (supplier_cost_source is null or supplier_cost_source in ('configured_primary', 'configured_sole'));

comment on column public.order_items.supplier_id is
  'Supplier selected by the configured sourcing rules when the order line was created.';
comment on column public.order_items.supplier_unit_cost is
  'Supplier unit cost captured when the order line was created. Used for historical gross product profit; excludes delivery and operating costs.';
comment on column public.order_items.supplier_cost_source is
  'How the purchase-time supplier cost was selected: configured primary supplier or the sole configured supplier.';

create or replace function public.populate_order_item_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_snapshot text;
  variant_snapshot text;
  unit_snapshot text;
  supplier_snapshot_id bigint;
  supplier_cost_snapshot numeric;
  supplier_cost_snapshot_source text;
begin
  if nullif(btrim(new.product_name), '') is null then
    select product.name
    into product_snapshot
    from public.products as product
    where product.id = new.product_id;
  end if;

  if nullif(btrim(new.variant_name), '') is null
    or nullif(btrim(new.unit), '') is null then
    select
      coalesce(
        nullif(btrim(variant.display_label), ''),
        nullif(btrim(variant.name), ''),
        nullif(btrim(variant.size), '')
      ),
      nullif(btrim(variant.unit), '')
    into variant_snapshot, unit_snapshot
    from public.product_variants as variant
    where variant.id = new.variant_id;
  end if;

  if new.supplier_unit_cost is null and new.variant_id is not null then
    with candidates as (
      select
        price.supplier_id,
        price.cost_price,
        link.is_primary,
        price.updated_at,
        price.id,
        count(*) over () as supplier_count
      from public.supplier_variant_prices as price
      join public.product_variants as variant on variant.id = price.variant_id
      join public.product_suppliers as link
        on link.product_id = variant.product_id
       and link.supplier_id = price.supplier_id
      where price.variant_id = new.variant_id
    )
    select
      candidate.supplier_id,
      candidate.cost_price,
      case when candidate.is_primary then 'configured_primary' else 'configured_sole' end
    into supplier_snapshot_id, supplier_cost_snapshot, supplier_cost_snapshot_source
    from candidates as candidate
    where candidate.is_primary or candidate.supplier_count = 1
    order by candidate.is_primary desc, candidate.updated_at desc, candidate.id desc
    limit 1;

    new.supplier_id := supplier_snapshot_id;
    new.supplier_unit_cost := supplier_cost_snapshot;
    new.supplier_cost_source := supplier_cost_snapshot_source;
  end if;

  new.product_name := coalesce(nullif(btrim(new.product_name), ''), product_snapshot, 'Archived product');
  new.variant_name := coalesce(nullif(btrim(new.variant_name), ''), variant_snapshot);
  new.unit := coalesce(nullif(btrim(new.unit), ''), unit_snapshot);
  return new;
end;
$$;

revoke all on function public.populate_order_item_snapshots() from public, anon, authenticated;

drop trigger if exists populate_order_item_snapshots_before_insert on public.order_items;
create trigger populate_order_item_snapshots_before_insert
before insert on public.order_items
for each row execute function public.populate_order_item_snapshots();

comment on function public.populate_order_item_snapshots() is
  'Captures fulfilment-safe labels and the configured supplier unit cost when an order line is inserted.';
