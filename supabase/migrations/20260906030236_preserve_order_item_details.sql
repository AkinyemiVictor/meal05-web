-- Keep the exact human-readable catalogue choice on every order line.
-- Product and variant records remain useful as a fallback, but they can be
-- renamed later and therefore must not be the historical source of truth.
alter table public.order_items
  add column if not exists product_name text,
  add column if not exists variant_name text,
  add column if not exists unit text;

update public.order_items as item
set
  product_name = coalesce(nullif(btrim(item.product_name), ''), product.name, 'Archived product'),
  variant_name = coalesce(
    nullif(btrim(item.variant_name), ''),
    nullif(btrim(variant.display_label), ''),
    nullif(btrim(variant.name), ''),
    nullif(btrim(variant.size), '')
  ),
  unit = coalesce(nullif(btrim(item.unit), ''), nullif(btrim(variant.unit), ''))
from public.products as product,
  public.product_variants as variant
where product.id = item.product_id
  and variant.id = item.variant_id
  and (
    nullif(btrim(item.product_name), '') is null
    or nullif(btrim(item.variant_name), '') is null
    or nullif(btrim(item.unit), '') is null
  );

update public.order_items
set product_name = 'Archived product'
where nullif(btrim(product_name), '') is null;

alter table public.order_items
  alter column product_name set not null;

comment on column public.order_items.product_name is
  'Product name captured when checkout created the order; immutable fulfilment/history label.';
comment on column public.order_items.variant_name is
  'Selected option label captured when checkout created the order.';
comment on column public.order_items.unit is
  'Selected option unit captured when checkout created the order.';
