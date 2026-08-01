create index if not exists cart_items_product_id_idx
  on public.cart_items(product_id);

create index if not exists cart_items_variant_id_idx
  on public.cart_items(variant_id);
