-- Make the authenticated Supabase cart authoritative and owner-scoped.

delete from public.cart_items
where user_id is null
   or product_id is null
   or variant_id is null
   or quantity is null
   or quantity <= 0;

with duplicate_totals as (
  select
    min(id) as keeper_id,
    user_id,
    variant_id,
    sum(quantity) as quantity
  from public.cart_items
  group by user_id, variant_id
  having count(*) > 1
)
update public.cart_items as cart
set quantity = totals.quantity,
    updated_at = now()
from duplicate_totals as totals
where cart.id = totals.keeper_id;

with duplicate_rows as (
  select
    id,
    row_number() over (partition by user_id, variant_id order by id) as row_number
  from public.cart_items
)
delete from public.cart_items as cart
using duplicate_rows as duplicates
where cart.id = duplicates.id
  and duplicates.row_number > 1;

alter table public.cart_items
  alter column user_id set not null,
  alter column product_id set not null,
  alter column variant_id set not null,
  alter column quantity set not null,
  alter column quantity set default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cart_items_product_id_fkey'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cart_items_quantity_positive_check'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_quantity_positive_check check (quantity > 0);
  end if;
end $$;

drop index if exists public.cart_items_user_variant_idx;
create unique index cart_items_user_variant_unique_idx
  on public.cart_items(user_id, variant_id);

alter table public.cart_items enable row level security;

drop policy if exists "Enable read access for all users" on public.cart_items;
drop policy if exists cart_items_owner_select on public.cart_items;
drop policy if exists cart_items_owner_insert on public.cart_items;
drop policy if exists cart_items_owner_update on public.cart_items;
drop policy if exists cart_items_owner_delete on public.cart_items;

create policy cart_items_owner_select
  on public.cart_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy cart_items_owner_insert
  on public.cart_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy cart_items_owner_update
  on public.cart_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy cart_items_owner_delete
  on public.cart_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.cart_items from anon;
grant select, insert, update, delete on table public.cart_items to authenticated;
grant usage, select on sequence public.cart_items_id_seq to authenticated;
