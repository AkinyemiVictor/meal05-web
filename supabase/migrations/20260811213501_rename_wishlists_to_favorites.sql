begin;
alter table public.wishlists rename to favorites;
alter table public.favorites rename constraint wishlists_pkey to favorites_pkey;
alter table public.favorites rename constraint wishlists_user_id_product_id_key to favorites_user_id_product_id_key;
alter sequence public.wishlists_id_seq rename to favorites_id_seq;
alter policy "Users can manage own wishlists" on public.favorites rename to "Users can manage own favorites";
comment on table public.favorites is 'Products a user has saved as favorites.';
commit;
