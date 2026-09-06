create or replace function public.populate_order_item_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_snapshot text;
  variant_snapshot text;
  unit_snapshot text;
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
  'Captures fulfilment-safe product and selected-option labels when an order line is inserted.';
