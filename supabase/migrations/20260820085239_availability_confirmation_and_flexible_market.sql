-- Availability confirmation and flexible fresh-produce preferences.
-- These two capabilities are independent: a flexible item may be stocked and a
-- request-only item may still use exact variants.

alter table public.products
  add column if not exists selection_model text not null default 'exact_variant',
  add column if not exists variation_note text;

alter table public.products
  drop constraint if exists products_selection_model_check,
  add constraint products_selection_model_check
    check (selection_model in ('exact_variant', 'flexible_market'));

alter table public.product_variants
  add column if not exists availability_mode text not null default 'standard',
  add column if not exists inventory_tracking_mode text not null default 'tracked';

alter table public.product_variants
  drop constraint if exists product_variants_availability_mode_check,
  add constraint product_variants_availability_mode_check
    check (availability_mode in ('standard', 'request', 'unavailable')),
  drop constraint if exists product_variants_inventory_tracking_mode_check,
  add constraint product_variants_inventory_tracking_mode_check
    check (inventory_tracking_mode in ('tracked', 'supplier'));

alter table public.product_variants
  drop constraint if exists product_variants_option_role_check,
  add constraint product_variants_option_role_check
    check (option_role is null or option_role in (
      'standard', 'volume_saver', 'manufacturer_pack', 'size',
      'ripeness', 'grade', 'form', 'value_tier'
    ));

alter table public.cart_items
  add column if not exists size_preference text;

alter table public.cart_items
  drop constraint if exists cart_items_size_preference_check,
  add constraint cart_items_size_preference_check
    check (size_preference is null or size_preference in ('best_available', 'smaller', 'medium', 'larger'));

alter table public.order_items
  add column if not exists size_preference text,
  add column if not exists fulfillment_note text;

alter table public.order_items
  drop constraint if exists order_items_size_preference_check,
  add constraint order_items_size_preference_check
    check (size_preference is null or size_preference in ('best_available', 'smaller', 'medium', 'larger'));

alter table public.orders
  add column if not exists paid_at timestamptz;

create table if not exists public.availability_settings (
  market_id uuid primary key references public.markets(id) on delete cascade,
  timezone text not null default 'Africa/Lagos',
  business_opens time not null default '08:00',
  business_closes time not null default '18:00',
  confirmation_sla_minutes integer not null default 120 check (confirmation_sla_minutes > 0),
  payment_window_minutes integer not null default 120 check (payment_window_minutes > 0),
  updated_at timestamptz not null default now()
);

insert into public.availability_settings (market_id)
values (public.default_market_id())
on conflict (market_id) do nothing;

create table if not exists public.availability_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id uuid not null references public.markets(id),
  status text not null default 'pending' check (status in (
    'pending', 'checking', 'action_required', 'confirmed', 'expired',
    'converted', 'cancelled'
  )),
  delivery_address text,
  customer_name text,
  customer_phone text,
  customer_note text,
  submitted_total numeric(12,2) not null default 0 check (submitted_total >= 0),
  final_total numeric(12,2) check (final_total is null or final_total >= 0),
  currency_code text not null default 'NGN',
  confirmation_deadline_at timestamptz not null,
  confirmed_at timestamptz,
  payment_expires_at timestamptz,
  converted_order_id integer references public.orders(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.availability_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.availability_requests(id) on delete cascade,
  product_id bigint not null references public.products(id),
  variant_id bigint not null references public.product_variants(id),
  product_name text not null,
  variant_name text,
  unit text,
  quantity numeric(12,3) not null check (quantity > 0),
  submitted_unit_price numeric(12,2) not null check (submitted_unit_price >= 0),
  confirmed_unit_price numeric(12,2) check (confirmed_unit_price is null or confirmed_unit_price >= 0),
  requires_confirmation boolean not null,
  resolution_status text not null check (resolution_status in ('not_required', 'pending', 'confirmed', 'unavailable')),
  size_preference text check (size_preference is null or size_preference in ('best_available', 'smaller', 'medium', 'larger')),
  admin_note text,
  customer_removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists availability_request_id uuid references public.availability_requests(id) on delete set null;

create unique index if not exists orders_availability_request_once_idx
  on public.orders(availability_request_id) where availability_request_id is not null;
create index if not exists availability_requests_user_created_idx
  on public.availability_requests(user_id, created_at desc);
create index if not exists availability_requests_queue_idx
  on public.availability_requests(status, confirmation_deadline_at);
create index if not exists availability_request_items_request_idx
  on public.availability_request_items(request_id, resolution_status);

alter table public.availability_settings enable row level security;
alter table public.availability_requests enable row level security;
alter table public.availability_request_items enable row level security;

drop policy if exists availability_settings_public_read on public.availability_settings;
create policy availability_settings_public_read on public.availability_settings
  for select to anon, authenticated using (true);
drop policy if exists availability_settings_admin_all on public.availability_settings;
create policy availability_settings_admin_all on public.availability_settings
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists availability_requests_owner_read on public.availability_requests;
create policy availability_requests_owner_read on public.availability_requests
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin_user());
drop policy if exists availability_requests_admin_all on public.availability_requests;
create policy availability_requests_admin_all on public.availability_requests
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists availability_request_items_owner_read on public.availability_request_items;
create policy availability_request_items_owner_read on public.availability_request_items
  for select to authenticated using (
    exists (
      select 1 from public.availability_requests ar
      where ar.id = request_id
        and (ar.user_id = (select auth.uid()) or public.is_admin_user())
    )
  );
drop policy if exists availability_request_items_admin_all on public.availability_request_items;
create policy availability_request_items_admin_all on public.availability_request_items
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

grant select on public.availability_settings to anon, authenticated;
grant select on public.availability_requests, public.availability_request_items to authenticated;
grant all on public.availability_settings, public.availability_requests, public.availability_request_items to service_role;

comment on column public.products.selection_model is
  'exact_variant requires no physical-size preference; flexible_market accepts a non-binding fulfilment preference.';
comment on column public.product_variants.availability_mode is
  'standard can proceed to checkout, request must be confirmed before payment, unavailable cannot be ordered.';
comment on column public.product_variants.inventory_tracking_mode is
  'tracked deducts local stock; supplier is fulfilled after confirmation and does not deduct stock_count.';
comment on column public.cart_items.size_preference is
  'Non-binding physical-size preference for flexible_market products; it never changes price or quantity.';

-- Stock remains atomic and idempotent while supplier-fulfilled variants bypass
-- local stock validation/deduction.
create or replace function public.deduct_stock_for_order(p_order_id integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_stock numeric;
  v_variant_market uuid;
  v_item_count integer;
  v_existing_count integer;
  v_source text := 'order:' || p_order_id::text;
begin
  if p_order_id is null then raise exception 'Order is required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select count(distinct oi.variant_id)::integer into v_item_count
  from public.order_items oi
  join public.product_variants pv on pv.id = oi.variant_id
  where oi.order_id = p_order_id and pv.inventory_tracking_mode = 'tracked';

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'Order has no items';
  end if;
  if exists (select 1 from public.order_items where order_id = p_order_id and (variant_id is null or quantity is null or quantity <= 0)) then
    raise exception 'Order contains an invalid item';
  end if;

  select count(distinct variant_id)::integer into v_existing_count
  from public.stock_ledger where reason = 'order_deduction' and source = v_source;
  if coalesce(v_existing_count, 0) = coalesce(v_item_count, 0) then return; end if;
  if coalesce(v_existing_count, 0) > 0 then raise exception 'Partial stock deduction detected for order %', p_order_id; end if;

  for v_item in
    select oi.variant_id, sum(oi.quantity)::numeric as quantity
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id and pv.inventory_tracking_mode = 'tracked'
    group by oi.variant_id order by oi.variant_id
  loop
    select stock_count, market_id into v_stock, v_variant_market
    from public.product_variants where id = v_item.variant_id for update;
    if v_variant_market <> v_order.market_id then raise exception 'Variant % belongs to a different market', v_item.variant_id; end if;
    if v_stock is null or v_stock < v_item.quantity then
      raise exception 'Insufficient stock for variant % (have %, need %)', v_item.variant_id, coalesce(v_stock, 0), v_item.quantity;
    end if;
  end loop;

  for v_item in
    select oi.variant_id, sum(oi.quantity)::numeric as quantity
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id and pv.inventory_tracking_mode = 'tracked'
    group by oi.variant_id order by oi.variant_id
  loop
    update public.product_variants set stock_count = stock_count - v_item.quantity, updated_at = now() where id = v_item.variant_id;
    insert into public.stock_ledger(variant_id, change_qty, reason, source, note)
    values (v_item.variant_id, -v_item.quantity, 'order_deduction', v_source, 'Confirmed payment for Meal05 order ' || p_order_id::text);
  end loop;
end;
$$;

-- Existing payment finalisers use this shared function in subsequent application
-- releases; paid_at is intentionally nullable until the first verified payment.

create or replace function public.set_order_paid_at_once()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(coalesce(new.payment_status, '')) in ('paid', 'confirmed')
     and lower(coalesce(old.payment_status, '')) not in ('paid', 'confirmed') then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists orders_set_paid_at_once on public.orders;
create trigger orders_set_paid_at_once before update of payment_status on public.orders
for each row execute function public.set_order_paid_at_once();

create or replace function public.mark_paystack_order_paid(
  p_order_id integer,
  p_transaction_ref text,
  p_amount numeric,
  p_currency_code text default 'NGN'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing_payment_order integer;
  v_reference text := btrim(coalesce(p_transaction_ref, ''));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
begin
  if v_reference = '' or v_currency = '' then raise exception 'Payment reference and currency are required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order % not found', p_order_id; end if;
  if p_amount is null or p_amount <> v_order.total then raise exception 'Payment amount does not match order total'; end if;
  if v_currency <> upper(v_order.currency_code) then raise exception 'Payment currency does not match order currency'; end if;
  select order_id into v_existing_payment_order from public.payments where transaction_ref = v_reference;
  if v_existing_payment_order is not null and v_existing_payment_order <> p_order_id then
    raise exception 'Payment reference is already assigned to another order';
  end if;
  if lower(coalesce(v_order.payment_status, '')) = 'paid' then
    if v_order.payment_reference = v_reference or v_existing_payment_order = p_order_id then
      return jsonb_build_object('order_id', p_order_id, 'transaction_ref', v_reference, 'already_processed', true, 'stock_updated', false);
    end if;
    raise exception 'Order is already paid with a different payment reference';
  end if;
  perform public.deduct_stock_for_order(p_order_id);
  insert into public.payments(order_id, amount, method, status, transaction_ref, paid_at, currency_code)
  values (p_order_id, p_amount, 'paystack', 'success', v_reference, now(), v_currency)
  on conflict (transaction_ref) do update set status = 'success', paid_at = coalesce(public.payments.paid_at, excluded.paid_at);
  update public.orders set payment_status = 'paid', payment_method = 'paystack', payment_reference = v_reference,
    payment_verified = true, status = 'processing', updated_at = now() where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'transaction_ref', v_reference, 'already_processed', false, 'stock_updated', true);
end;
$$;

create or replace function public.debit_wallet_for_order(
  p_order_id integer,
  p_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_balance numeric;
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reference text;
begin
  if p_order_id is null or p_user_id is null or v_idempotency is null then raise exception 'Order, user and idempotency key are required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.user_id <> p_user_id then raise exception 'Forbidden'; end if;
  select * into v_existing from public.wallet_transactions
    where user_id = p_user_id and idempotency_key = v_idempotency and type = 'debit' and reason = 'order_payment' limit 1;
  if found then return jsonb_build_object('already_processed', true, 'transaction_id', v_existing.id, 'balance', public.get_wallet_balance(p_user_id)); end if;
  if lower(coalesce(v_order.payment_status, '')) = 'paid' then raise exception 'Order is already paid'; end if;
  if v_order.total is null or v_order.total <= 0 then raise exception 'Order total must be greater than zero'; end if;
  if upper(coalesce(v_order.currency_code, 'NGN')) <> 'NGN' then raise exception 'Wallet currently supports NGN orders only'; end if;
  perform public.ensure_wallet_account(p_user_id, coalesce(v_order.currency_code, 'NGN'));
  select * into v_account from public.wallet_accounts where user_id = p_user_id for update;
  if v_account.status <> 'active' then raise exception 'Wallet is not active'; end if;
  v_balance := public.get_wallet_balance(p_user_id);
  if v_balance < v_order.total then raise exception 'Insufficient Meal05 Balance'; end if;
  perform public.deduct_stock_for_order(p_order_id);
  v_reference := 'WALLET-' || p_order_id::text || '-' || replace(v_idempotency, ':', '-');
  insert into public.wallet_transactions(user_id, amount, type, reason, order_id, idempotency_key, external_reference, metadata, note, created_at)
  values (p_user_id, -v_order.total, 'debit', 'order_payment', p_order_id, v_idempotency, v_reference,
    jsonb_build_object('currencyCode', v_order.currency_code), 'Meal05 Balance order payment', now()) returning * into v_existing;
  insert into public.payments(order_id, amount, method, status, transaction_ref, paid_at, currency_code)
  values (p_order_id, v_order.total, 'wallet', 'success', v_reference, now(), coalesce(v_order.currency_code, 'NGN'))
  on conflict (transaction_ref) do update set status = 'success', paid_at = coalesce(public.payments.paid_at, excluded.paid_at);
  update public.orders set payment_status = 'paid', payment_method = 'wallet', payment_reference = v_reference,
    payment_verified = true, status = 'processing', updated_at = now() where id = p_order_id;
  return jsonb_build_object('already_processed', false, 'transaction_id', v_existing.id,
    'balance', public.get_wallet_balance(p_user_id), 'payment_reference', v_reference);
end;
$$;

revoke all on function public.mark_paystack_order_paid(integer, text, numeric, text) from public, anon, authenticated;
revoke all on function public.debit_wallet_for_order(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_paystack_order_paid(integer, text, numeric, text) to service_role;
grant execute on function public.debit_wallet_for_order(integer, uuid, text) to service_role;
