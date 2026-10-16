begin;

-- The storefront no longer separates carts by shopping mode. Restore the
-- canonical uniqueness expected by src/app/api/cart/route.js.
drop index if exists public.cart_items_user_mode_variant_unique;
drop index if exists public.cart_items_user_variant_unique_idx;
drop index if exists public.cart_items_user_variant_unique;
alter table public.cart_items drop constraint if exists cart_items_user_id_variant_id_key;

create unique index if not exists cart_items_user_variant_unique_idx
  on public.cart_items(user_id, variant_id);

commit;
