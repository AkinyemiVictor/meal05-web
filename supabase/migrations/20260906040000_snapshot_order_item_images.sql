alter table public.order_items
  add column if not exists image_url text;

update public.order_items as item
set image_url = nullif(btrim(product.main_image_url), '')
from public.products as product
where product.id = item.product_id
  and nullif(btrim(item.image_url), '') is null;

create or replace function public.populate_order_item_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_snapshot text;
  image_snapshot text;
  variant_snapshot text;
  unit_snapshot text;
begin
  if nullif(btrim(new.product_name), '') is null
    or nullif(btrim(new.image_url), '') is null then
    select product.name, nullif(btrim(product.main_image_url), '')
    into product_snapshot, image_snapshot
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
  new.image_url := coalesce(nullif(btrim(new.image_url), ''), image_snapshot);
  new.variant_name := coalesce(nullif(btrim(new.variant_name), ''), variant_snapshot);
  new.unit := coalesce(nullif(btrim(new.unit), ''), unit_snapshot);
  return new;
end;
$$;

revoke all on function public.populate_order_item_snapshots() from public, anon, authenticated;

comment on column public.order_items.image_url is
  'Product image captured when the order line is created so order history remains stable.';

comment on function public.populate_order_item_snapshots() is
  'Captures fulfilment-safe product, image, and selected-option details when an order line is inserted.';
