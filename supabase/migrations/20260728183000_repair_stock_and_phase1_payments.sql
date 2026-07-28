-- Repair production schema drift for variant stock and Phase 1 manual payments.
-- Stock remains single-source at product_variants.stock_count.

drop trigger if exists decrease_product_stock_trigger on public.order_items;
drop function if exists public.decrease_product_stock();
drop function if exists public.decrease_product_stock(integer);
drop function if exists public.decrease_product_stock(integer, text, text);
drop function if exists public.deduct_stock_for_order(uuid);

drop trigger if exists trg_order_paid_after_payment on public.payments;
drop trigger if exists trg_update_order_status_after_payment on public.payments;
drop function if exists public.mark_order_paid_after_payment();
drop function if exists public.update_order_status_after_payment();

alter table public.cart_items
  add column if not exists variant_id bigint,
  add column if not exists unit_price_at_add numeric,
  add column if not exists variant_name text,
  add column if not exists product_name text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_variant_id_fkey'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_variant_id_fkey
      foreign key (variant_id) references public.product_variants(id) on delete cascade;
  end if;
end $$;

create index if not exists cart_items_user_variant_idx
  on public.cart_items(user_id, variant_id);

alter table public.payments
  add column if not exists reference text,
  add column if not exists user_id uuid,
  add column if not exists purpose text,
  add column if not exists provider_code text,
  add column if not exists currency text not null default 'NGN',
  add column if not exists wallet_topup_id uuid,
  add column if not exists payer_account_name text,
  add column if not exists payer_bank_name text,
  add column if not exists customer_transaction_reference text,
  add column if not exists proof_storage_path text,
  add column if not exists customer_submitted_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejection_reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payments alter column paid_at drop default;

update public.payments
set reference = coalesce(reference, transaction_ref),
    purpose = coalesce(purpose, 'order_payment'),
    currency = coalesce(currency, currency_code, 'NGN'),
    updated_at = coalesce(updated_at, created_at, now())
where reference is null or purpose is null or currency is null or updated_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_user_id_fkey' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_provider_code_fkey' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_provider_code_fkey foreign key (provider_code) references public.payment_provider_settings(code) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_wallet_topup_id_fkey' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_wallet_topup_id_fkey foreign key (wallet_topup_id) references public.wallet_topups(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_verified_by_fkey' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_verified_by_fkey foreign key (verified_by) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_rejected_by_fkey' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_rejected_by_fkey foreign key (rejected_by) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_positive_check' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_amount_positive_check check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_purpose_check' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_purpose_check check (purpose is null or purpose in ('order_payment', 'wallet_topup'));
  end if;
end $$;

create unique index if not exists payments_reference_unique_idx
  on public.payments(reference) where reference is not null;
create index if not exists payments_user_created_idx
  on public.payments(user_id, created_at desc);
create index if not exists payments_order_idx
  on public.payments(order_id);
create index if not exists payments_status_idx
  on public.payments(status);
create index if not exists payments_provider_created_idx
  on public.payments(provider_code, created_at desc);
create unique index if not exists payments_one_active_order_payment_idx
  on public.payments(order_id)
  where purpose = 'order_payment'
    and order_id is not null
    and status not in ('cancelled', 'rejected', 'expired', 'failed', 'refunded');

alter table public.wallet_topups drop constraint if exists wallet_topups_provider_check;
alter table public.wallet_topups
  add constraint wallet_topups_provider_check
  check (provider in ('paystack', 'monnify', 'opay', 'moniepoint_transfer', 'opay_transfer'));

alter table public.wallet_topups drop constraint if exists wallet_topups_status_check;
alter table public.wallet_topups
  add constraint wallet_topups_status_check
  check (status in ('pending', 'awaiting_transfer', 'submitted', 'processing', 'successful', 'failed', 'cancelled', 'rejected', 'reversed', 'expired'));

alter table public.wallet_transactions drop constraint if exists wallet_transactions_provider_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_provider_check
  check (provider is null or provider in ('paystack', 'monnify', 'opay', 'moniepoint_transfer', 'opay_transfer'));

create unique index if not exists stock_ledger_order_deduction_once_idx
  on public.stock_ledger(variant_id, source)
  where reason = 'order_deduction' and source is not null;

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
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  select count(distinct variant_id)::integer into v_item_count
  from public.order_items
  where order_id = p_order_id;

  if coalesce(v_item_count, 0) = 0 then
    raise exception 'Order has no items';
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and (variant_id is null or quantity is null or quantity <= 0)
  ) then
    raise exception 'Order contains an invalid item';
  end if;

  select count(distinct variant_id)::integer into v_existing_count
  from public.stock_ledger
  where reason = 'order_deduction'
    and source = v_source;

  if coalesce(v_existing_count, 0) = v_item_count then
    return;
  end if;
  if coalesce(v_existing_count, 0) > 0 then
    raise exception 'Partial stock deduction detected for order %', p_order_id;
  end if;

  for v_item in
    select variant_id, sum(quantity)::numeric as quantity
    from public.order_items
    where order_id = p_order_id
    group by variant_id
    order by variant_id
  loop
    select stock_count, market_id
      into v_stock, v_variant_market
    from public.product_variants
    where id = v_item.variant_id
    for update;

    if not found then
      raise exception 'Variant % not found', v_item.variant_id;
    end if;
    if v_variant_market <> v_order.market_id then
      raise exception 'Variant % belongs to a different market', v_item.variant_id;
    end if;
    if v_stock is null or v_stock < v_item.quantity then
      raise exception 'Insufficient stock for variant % (have %, need %)',
        v_item.variant_id, coalesce(v_stock, 0), v_item.quantity;
    end if;
  end loop;

  for v_item in
    select variant_id, sum(quantity)::numeric as quantity
    from public.order_items
    where order_id = p_order_id
    group by variant_id
    order by variant_id
  loop
    update public.product_variants
    set stock_count = stock_count - v_item.quantity,
        updated_at = now()
    where id = v_item.variant_id;

    insert into public.stock_ledger(variant_id, change_qty, reason, source, note)
    values (
      v_item.variant_id,
      -v_item.quantity,
      'order_deduction',
      v_source,
      'Confirmed payment for Meal05 order ' || p_order_id::text
    );
  end loop;
end;
$$;

create or replace function public.verify_manual_payment(
  p_payment_id integer,
  p_administrator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_topup public.wallet_topups%rowtype;
  v_reference text;
  v_wallet_result jsonb;
begin
  if p_payment_id is null or p_administrator_id is null then
    raise exception 'Payment and administrator are required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status in ('verified', 'success') then
    return jsonb_build_object(
      'already_processed', true,
      'payment_id', v_payment.id,
      'reference', coalesce(v_payment.reference, v_payment.transaction_ref)
    );
  end if;

  if v_payment.status not in ('awaiting_transfer', 'submitted', 'pending') then
    raise exception 'Payment cannot be verified from status %', v_payment.status;
  end if;

  v_reference := nullif(btrim(coalesce(v_payment.reference, v_payment.transaction_ref, '')), '');
  if v_reference is null then
    raise exception 'Payment reference is missing';
  end if;

  if v_payment.purpose = 'wallet_topup' then
    if v_payment.wallet_topup_id is null or v_payment.user_id is null then
      raise exception 'Wallet top-up payment is incomplete';
    end if;

    select * into v_topup
    from public.wallet_topups
    where id = v_payment.wallet_topup_id
    for update;

    if not found then
      raise exception 'Wallet top-up not found';
    end if;
    if v_topup.user_id <> v_payment.user_id then
      raise exception 'Wallet top-up owner mismatch';
    end if;
    if v_topup.amount <> v_payment.amount then
      raise exception 'Wallet top-up amount mismatch';
    end if;
    if upper(v_topup.currency_code) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Wallet top-up currency mismatch';
    end if;

    v_wallet_result := public.credit_wallet_topup(
      v_topup.id,
      v_reference,
      'manual-payment:' || v_payment.id::text
    );
  elsif v_payment.purpose = 'order_payment' then
    if v_payment.order_id is null then
      raise exception 'Order payment is missing its order';
    end if;

    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if not found then
      raise exception 'Order not found';
    end if;
    if v_payment.user_id is not null and v_order.user_id <> v_payment.user_id then
      raise exception 'Order owner mismatch';
    end if;
    if v_order.total <> v_payment.amount then
      raise exception 'Payment amount does not match order total';
    end if;
    if upper(v_order.currency_code) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Payment currency does not match order currency';
    end if;

    if coalesce(lower(v_order.payment_status), '') <> 'paid' then
      perform public.deduct_stock_for_order(v_order.id);

      update public.orders
      set payment_status = 'paid',
          payment_method = v_payment.provider_code,
          payment_reference = v_reference,
          payment_verified = true,
          status = 'processing',
          updated_at = now()
      where id = v_order.id;
    end if;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payments
  set status = 'verified',
      reference = coalesce(reference, v_reference),
      transaction_ref = coalesce(transaction_ref, v_reference),
      paid_at = coalesce(paid_at, now()),
      verified_at = coalesce(verified_at, now()),
      verified_by = coalesce(verified_by, p_administrator_id),
      updated_at = now()
  where id = v_payment.id;

  return jsonb_build_object(
    'already_processed', false,
    'payment_id', v_payment.id,
    'reference', v_reference,
    'wallet', v_wallet_result
  );
end;
$$;

create or replace function public.reject_manual_payment(
  p_payment_id integer,
  p_administrator_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_payment_id is null or p_administrator_id is null then
    raise exception 'Payment and administrator are required';
  end if;
  if v_reason is null then
    raise exception 'Rejection reason is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status in ('verified', 'success') then
    raise exception 'Verified payment cannot be rejected';
  end if;
  if v_payment.status = 'rejected' then
    return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected', 'already_processed', true);
  end if;

  update public.payments
  set status = 'rejected',
      rejected_at = now(),
      rejected_by = p_administrator_id,
      rejection_reason = v_reason,
      updated_at = now()
  where id = v_payment.id;

  if v_payment.wallet_topup_id is not null then
    update public.wallet_topups
    set status = 'rejected',
        failure_reason = v_reason,
        updated_at = now()
    where id = v_payment.wallet_topup_id;
  end if;

  return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected', 'already_processed', false);
end;
$$;

revoke all on function public.deduct_stock_for_order(integer) from public, anon, authenticated;
revoke all on function public.verify_manual_payment(integer, uuid) from public, anon, authenticated;
revoke all on function public.reject_manual_payment(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.deduct_stock_for_order(integer) to service_role;
grant execute on function public.verify_manual_payment(integer, uuid) to service_role;
grant execute on function public.reject_manual_payment(integer, uuid, text) to service_role;

grant all on table public.payments to service_role;
grant all on table public.payment_provider_settings to service_role;

update public.wallet_settings
set wallet_enabled = true,
    wallet_payment_enabled = true,
    wallet_refunds_enabled = true,
    paystack_topups_enabled = false,
    monnify_topups_enabled = true,
    opay_topups_enabled = false,
    mixed_payment_enabled = false,
    minimum_topup_amount = coalesce(minimum_topup_amount, 1000),
    maximum_topup_amount = coalesce(maximum_topup_amount, 500000),
    daily_topup_limit = coalesce(daily_topup_limit, 500000),
    updated_at = now()
where id = true;

notify pgrst, 'reload schema';
