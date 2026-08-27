-- Focused checkout/manual-payment hardening.
--
-- This migration intentionally keeps financial writes behind service-role APIs,
-- preserves the existing Paystack/wallet architecture, and leaves the nine
-- server-only RLS/no-policy tables closed to browser roles.

-- ---------------------------------------------------------------------------
-- Least-privilege browser access for order and payment data
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

drop policy if exists "orders_user_access" on public.orders;
drop policy if exists "Users can insert their own orders" on public.orders;
drop policy if exists "Users can view their own orders" on public.orders;
drop policy if exists "Admins can view and manage all orders" on public.orders;
drop policy if exists "orders_select_own" on public.orders;
drop policy if exists "orders_admin_all" on public.orders;

drop policy if exists "order_items_access" on public.order_items;
drop policy if exists "Users can view order items of their own orders" on public.order_items;
drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_admin_all" on public.order_items;

drop policy if exists "payments_user_access" on public.payments;
drop policy if exists "Users can view their own payments" on public.payments;
drop policy if exists "payments_select_own" on public.payments;
drop policy if exists "payments_admin_all" on public.payments;

-- Remove any dashboard-created legacy write policy not represented in source
-- control. SELECT policies are recreated explicitly below.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_items', 'payments')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end;
$$;

revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.payments to authenticated;

grant all on table public.orders to service_role;
grant all on table public.order_items to service_role;
grant all on table public.payments to service_role;

create policy orders_select_own
on public.orders
for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy order_items_select_own
on public.order_items
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.user_id = (select auth.uid())
  )
);

create policy payments_select_own
on public.payments
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.orders o
      where o.id = payments.order_id
        and o.user_id = (select auth.uid())
    )
  )
);

-- ---------------------------------------------------------------------------
-- Security-advisor findings: invoker view, private role lookup, trigger ACLs
-- ---------------------------------------------------------------------------

alter view if exists public.products_cards_view set (security_invoker = true);
revoke all on table public.products_cards_view from anon, authenticated;
grant select on table public.products_cards_view to anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.current_user_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where (u.auth_id = (select auth.uid()) or u.id = (select auth.uid()))
      and coalesce(u.is_active, true)
      and lower(coalesce(u.role, '')) = any (p_roles)
  );
$$;

revoke all on function private.current_user_has_role(text[]) from public;
grant execute on function private.current_user_has_role(text[]) to anon, authenticated, service_role;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_has_role(array['admin', 'super_admin', 'superadmin']::text[]);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_has_role(array['admin', 'super_admin', 'superadmin']::text[]);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_has_role(array['dispatcher', 'staff', 'admin', 'super_admin', 'superadmin']::text[]);
$$;

revoke all on function public.is_admin_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
grant execute on function public.is_admin_user() to anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;

-- Trigger functions do not need to be callable as public RPCs. Existing
-- triggers continue to execute with the function owner's privileges.
revoke all on function public.sync_product_main_image() from public, anon, authenticated;
grant execute on function public.sync_product_main_image() to service_role;

-- These tables are intentionally server-only. RLS-with-no-policy is the
-- desired fail-closed posture; comments make the advisor decision explicit.
revoke all on table public.delivery_access_tokens from anon, authenticated;
revoke all on table public.delivery_audit_logs from anon, authenticated;
revoke all on table public.delivery_partners from anon, authenticated;
revoke all on table public.delivery_route_stops from anon, authenticated;
revoke all on table public.delivery_routes from anon, authenticated;
revoke all on table public.order_idempotency_keys from anon, authenticated;
revoke all on table public.payment_provider_settings from anon, authenticated;
revoke all on table public.product_image_blobs from anon, authenticated;
revoke all on table public.rider_current_locations from anon, authenticated;

grant all on table public.delivery_access_tokens to service_role;
grant all on table public.delivery_audit_logs to service_role;
grant all on table public.delivery_partners to service_role;
grant all on table public.delivery_route_stops to service_role;
grant all on table public.delivery_routes to service_role;
grant all on table public.order_idempotency_keys to service_role;
grant all on table public.payment_provider_settings to service_role;
grant all on table public.product_image_blobs to service_role;
grant all on table public.rider_current_locations to service_role;
comment on table public.delivery_access_tokens is 'Server-only delivery access tokens. RLS intentionally has no browser policy.';
comment on table public.delivery_audit_logs is 'Server-only delivery audit history. RLS intentionally has no browser policy.';
comment on table public.delivery_partners is 'Server-only rider directory containing private verification data. RLS intentionally has no browser policy.';
comment on table public.delivery_route_stops is 'Server-only delivery routing state. Customer-safe data is exposed through protected APIs.';
comment on table public.delivery_routes is 'Server-only delivery routing state. RLS intentionally has no browser policy.';
comment on table public.order_idempotency_keys is 'Server-only order idempotency state. RLS intentionally has no browser policy.';
comment on table public.payment_provider_settings is 'Server-only provider configuration. Sanitized provider data is exposed through protected APIs.';
comment on table public.product_image_blobs is 'Server-only product image ingestion metadata. RLS intentionally has no browser policy.';
comment on table public.rider_current_locations is 'Server-only rider location data. Customer-safe data is exposed through protected APIs.';

-- ---------------------------------------------------------------------------
-- Reusable server-time expiry transition
-- ---------------------------------------------------------------------------

create or replace function public.expire_manual_payment_if_needed(
  p_payment_id integer,
  p_expected_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_payment_id is null then
    raise exception 'Payment is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;
  if p_expected_user_id is not null and v_payment.user_id is distinct from p_expected_user_id then
    raise exception 'Payment not found';
  end if;

  if lower(coalesce(v_payment.status, '')) in ('verified', 'success', 'successful', 'refunded') then
    return jsonb_build_object('expired', false, 'terminal', true, 'status', v_payment.status);
  end if;
  if v_payment.expires_at is null or v_now <= v_payment.expires_at then
    return jsonb_build_object('expired', false, 'status', v_payment.status);
  end if;

  -- A transfer validly submitted before expiry remains reviewable even when
  -- the administrator checks it later.
  if lower(coalesce(v_payment.status, '')) = 'submitted'
     and v_payment.customer_submitted_at is not null
     and v_payment.customer_submitted_at <= v_payment.expires_at then
    return jsonb_build_object('expired', false, 'submitted_before_expiry', true, 'status', v_payment.status);
  end if;

  if lower(coalesce(v_payment.status, '')) not in ('pending', 'awaiting_transfer', 'processing', 'submitted') then
    return jsonb_build_object('expired', false, 'status', v_payment.status);
  end if;

  update public.payments
  set status = 'expired', updated_at = v_now
  where id = v_payment.id;

  if v_payment.purpose = 'wallet_topup' and v_payment.wallet_topup_id is not null then
    update public.wallet_topups
    set status = 'expired',
        failure_reason = 'Payment request expired before a valid transfer submission.',
        updated_at = v_now
    where id = v_payment.wallet_topup_id
      and status not in ('successful', 'reversed');
  elsif v_payment.purpose = 'order_payment' and v_payment.order_id is not null then
    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if found
       and lower(coalesce(v_order.payment_status, '')) not in ('paid', 'confirmed', 'refunded')
       and lower(coalesce(v_order.status, '')) <> 'cancelled' then
      update public.orders
      set payment_status = 'awaiting_payment', updated_at = v_now
      where id = v_order.id;
    end if;
  end if;

  return jsonb_build_object(
    'expired', true,
    'status', 'expired',
    'payment_id', v_payment.id,
    'code', 'PAYMENT_EXPIRED',
    'error', 'This payment request has expired. Start a new payment to continue.'
  );
end;
$$;

revoke all on function public.expire_manual_payment_if_needed(integer, uuid) from public, anon, authenticated;
grant execute on function public.expire_manual_payment_if_needed(integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic transfer submission
-- ---------------------------------------------------------------------------

create or replace function public.submit_manual_payment(
  p_payment_id integer,
  p_user_id uuid,
  p_payer_account_name text,
  p_payer_bank_name text,
  p_customer_transaction_reference text,
  p_exact_amount_confirmed boolean
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
  v_availability public.availability_requests%rowtype;
  v_expiry jsonb;
  v_now timestamptz := statement_timestamp();
  v_payer_name text := btrim(coalesce(p_payer_account_name, ''));
  v_bank_name text := btrim(coalesce(p_payer_bank_name, ''));
  v_customer_reference text := nullif(btrim(coalesce(p_customer_transaction_reference, '')), '');
begin
  if p_payment_id is null or p_user_id is null then
    raise exception 'Payment and user are required';
  end if;
  if p_exact_amount_confirmed is distinct from true then
    raise exception 'Exact amount confirmation is required';
  end if;
  if char_length(v_payer_name) not between 2 and 120 then
    raise exception 'Payer account name must be between 2 and 120 characters';
  end if;
  if char_length(v_bank_name) not between 2 and 120 then
    raise exception 'Payer bank name must be between 2 and 120 characters';
  end if;
  if v_customer_reference is not null and char_length(v_customer_reference) > 120 then
    raise exception 'Transaction reference must be 120 characters or fewer';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found or v_payment.user_id is distinct from p_user_id then
    raise exception 'Payment not found';
  end if;

  if lower(coalesce(v_payment.status, '')) = 'submitted' then
    return jsonb_build_object(
      'already_processed', true,
      'payment', jsonb_build_object(
        'id', v_payment.id,
        'reference', coalesce(v_payment.reference, v_payment.transaction_ref),
        'amount', v_payment.amount,
        'currency', coalesce(v_payment.currency, v_payment.currency_code, 'NGN'),
        'status', v_payment.status,
        'purpose', v_payment.purpose,
        'order_id', v_payment.order_id,
        'wallet_topup_id', v_payment.wallet_topup_id,
        'provider_code', v_payment.provider_code,
        'customer_submitted_at', v_payment.customer_submitted_at
      )
    );
  end if;
  if lower(coalesce(v_payment.status, '')) in ('verified', 'success', 'successful', 'refunded') then
    raise exception 'Payment already verified';
  end if;
  if lower(coalesce(v_payment.status, '')) not in ('awaiting_transfer', 'pending') then
    raise exception 'Payment cannot be submitted from status %', v_payment.status;
  end if;

  select public.expire_manual_payment_if_needed(v_payment.id, p_user_id) into v_expiry;
  if coalesce((v_expiry ->> 'expired')::boolean, false) then
    return v_expiry;
  end if;

  if not exists (
    select 1
    from public.payment_provider_settings s
    where s.code = v_payment.provider_code
      and s.method_type = 'bank_transfer'
  ) then
    raise exception 'Payment is not a manual bank transfer';
  end if;

  if v_payment.purpose = 'order_payment' then
    if v_payment.order_id is null then
      raise exception 'Order payment is missing its order';
    end if;

    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if not found or v_order.user_id is distinct from p_user_id then
      raise exception 'Order not found';
    end if;
    if v_order.total is distinct from v_payment.amount then
      raise exception 'Payment amount does not match order total';
    end if;
    if upper(coalesce(v_order.currency_code, 'NGN')) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Payment currency does not match order currency';
    end if;
    if lower(coalesce(v_order.payment_status, '')) in ('paid', 'confirmed', 'refunded')
       or coalesce(v_order.payment_verified, false) then
      raise exception 'Order is already paid';
    end if;
    if lower(coalesce(v_order.status, '')) = 'cancelled' then
      raise exception 'Cancelled orders cannot be paid';
    end if;

    if v_order.availability_request_id is not null then
      select * into v_availability
      from public.availability_requests
      where id = v_order.availability_request_id
      for update;

      if not found
         or v_availability.status <> 'converted'
         or v_availability.converted_order_id is distinct from v_order.id then
        raise exception 'Availability confirmation is required before payment';
      end if;
      if v_availability.payment_expires_at is null or v_now >= v_availability.payment_expires_at then
        update public.payments set status = 'expired', updated_at = v_now where id = v_payment.id;
        update public.orders set payment_status = 'awaiting_payment', updated_at = v_now where id = v_order.id;
        return jsonb_build_object(
          'expired', true,
          'status', 'expired',
          'payment_id', v_payment.id,
          'code', 'PAYMENT_EXPIRED',
          'error', 'This payment request has expired. Start a new payment to continue.'
        );
      end if;
    end if;
  elsif v_payment.purpose = 'wallet_topup' then
    if v_payment.wallet_topup_id is null then
      raise exception 'Wallet top-up payment is incomplete';
    end if;

    select * into v_topup
    from public.wallet_topups
    where id = v_payment.wallet_topup_id
    for update;

    if not found or v_topup.user_id is distinct from p_user_id then
      raise exception 'Wallet top-up not found';
    end if;
    if v_topup.amount is distinct from v_payment.amount then
      raise exception 'Wallet top-up amount mismatch';
    end if;
    if upper(v_topup.currency_code) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Wallet top-up currency mismatch';
    end if;
    if lower(v_topup.status) not in ('awaiting_transfer', 'pending') then
      raise exception 'Wallet top-up cannot be submitted from status %', v_topup.status;
    end if;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payments
  set status = 'submitted',
      payer_account_name = v_payer_name,
      payer_bank_name = v_bank_name,
      customer_transaction_reference = v_customer_reference,
      customer_submitted_at = v_now,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('exactAmountConfirmed', true),
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  if v_payment.purpose = 'order_payment' then
    update public.orders
    set payment_status = 'awaiting_confirmation', updated_at = v_now
    where id = v_order.id;

    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (
      v_order.id,
      v_order.status,
      v_order.status,
      p_user_id,
      'Payment submitted; awaiting administrator confirmation'
    );

    delete from public.cart_items where user_id = p_user_id;
  else
    update public.wallet_topups
    set status = 'submitted', updated_at = v_now
    where id = v_topup.id;
  end if;

  return jsonb_build_object(
    'already_processed', false,
    'payment', jsonb_build_object(
      'id', v_payment.id,
      'reference', coalesce(v_payment.reference, v_payment.transaction_ref),
      'amount', v_payment.amount,
      'currency', coalesce(v_payment.currency, v_payment.currency_code, 'NGN'),
      'status', v_payment.status,
      'purpose', v_payment.purpose,
      'order_id', v_payment.order_id,
      'wallet_topup_id', v_payment.wallet_topup_id,
      'provider_code', v_payment.provider_code,
      'customer_submitted_at', v_payment.customer_submitted_at
    )
  );
end;
$$;

revoke all on function public.submit_manual_payment(integer, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_manual_payment(integer, uuid, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Verification and rejection remain atomic, service-role-only operations
-- ---------------------------------------------------------------------------

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
  v_expiry jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_payment_id is null or p_administrator_id is null then
    raise exception 'Payment and administrator are required';
  end if;

  select public.expire_manual_payment_if_needed(p_payment_id, null) into v_expiry;
  if coalesce((v_expiry ->> 'expired')::boolean, false) then
    return v_expiry;
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'Payment not found'; end if;
  if lower(coalesce(v_payment.status, '')) in ('verified', 'success', 'successful') then
    return jsonb_build_object(
      'already_processed', true,
      'payment_id', v_payment.id,
      'reference', coalesce(v_payment.reference, v_payment.transaction_ref)
    );
  end if;
  if lower(coalesce(v_payment.status, '')) not in ('awaiting_transfer', 'submitted', 'pending') then
    raise exception 'Payment cannot be verified from status %', v_payment.status;
  end if;
  if lower(coalesce(v_payment.status, '')) = 'submitted'
     and v_payment.expires_at is not null
     and (v_payment.customer_submitted_at is null or v_payment.customer_submitted_at > v_payment.expires_at) then
    update public.payments set status = 'expired', updated_at = v_now where id = v_payment.id;
    if v_payment.wallet_topup_id is not null then
      update public.wallet_topups set status = 'expired', updated_at = v_now where id = v_payment.wallet_topup_id;
    elsif v_payment.order_id is not null then
      update public.orders
      set payment_status = 'awaiting_payment', updated_at = v_now
      where id = v_payment.order_id
        and lower(coalesce(payment_status, '')) not in ('paid', 'confirmed', 'refunded');
    end if;
    return jsonb_build_object(
      'expired', true,
      'status', 'expired',
      'payment_id', v_payment.id,
      'code', 'PAYMENT_EXPIRED',
      'error', 'This payment request has expired. Start a new payment to continue.'
    );
  end if;
  if not exists (
    select 1 from public.payment_provider_settings s
    where s.code = v_payment.provider_code and s.method_type = 'bank_transfer'
  ) then
    raise exception 'Payment is not a manual bank transfer';
  end if;

  v_reference := nullif(btrim(coalesce(v_payment.reference, v_payment.transaction_ref, '')), '');
  if v_reference is null then raise exception 'Payment reference is missing'; end if;

  if v_payment.purpose = 'wallet_topup' then
    if v_payment.wallet_topup_id is null or v_payment.user_id is null then
      raise exception 'Wallet top-up payment is incomplete';
    end if;

    select * into v_topup
    from public.wallet_topups
    where id = v_payment.wallet_topup_id
    for update;

    if not found then raise exception 'Wallet top-up not found'; end if;
    if v_topup.user_id is distinct from v_payment.user_id then raise exception 'Wallet top-up owner mismatch'; end if;
    if v_topup.amount is distinct from v_payment.amount then raise exception 'Wallet top-up amount mismatch'; end if;
    if upper(v_topup.currency_code) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Wallet top-up currency mismatch';
    end if;

    v_wallet_result := public.credit_wallet_topup(
      v_topup.id,
      v_reference,
      'manual-payment:' || v_payment.id::text
    );
  elsif v_payment.purpose = 'order_payment' then
    if v_payment.order_id is null then raise exception 'Order payment is missing its order'; end if;

    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if not found then raise exception 'Order not found'; end if;
    if v_payment.user_id is not null and v_order.user_id is distinct from v_payment.user_id then
      raise exception 'Order owner mismatch';
    end if;
    if v_order.total is distinct from v_payment.amount then raise exception 'Payment amount does not match order total'; end if;
    if upper(v_order.currency_code) <> upper(coalesce(v_payment.currency, v_payment.currency_code, 'NGN')) then
      raise exception 'Payment currency does not match order currency';
    end if;

    if lower(coalesce(v_order.payment_status, '')) not in ('paid', 'confirmed') then
      perform public.deduct_stock_for_order(v_order.id);

      update public.orders
      set payment_status = 'paid',
          payment_method = v_payment.provider_code,
          payment_reference = v_reference,
          payment_verified = true,
          status = 'processing',
          updated_at = v_now
      where id = v_order.id;

      insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
      values (v_order.id, v_order.status, 'processing', p_administrator_id, 'Payment confirmed by administrator');
    end if;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payments
  set status = 'verified',
      reference = coalesce(reference, v_reference),
      transaction_ref = coalesce(transaction_ref, v_reference),
      paid_at = coalesce(paid_at, v_now),
      verified_at = coalesce(verified_at, v_now),
      verified_by = coalesce(verified_by, p_administrator_id),
      updated_at = v_now
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
  v_order public.orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := statement_timestamp();
begin
  if p_payment_id is null or p_administrator_id is null then
    raise exception 'Payment and administrator are required';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Rejection reason must be between 3 and 500 characters';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'Payment not found'; end if;
  if lower(coalesce(v_payment.status, '')) in ('verified', 'success', 'successful', 'refunded') then
    raise exception 'Verified payment cannot be rejected';
  end if;
  if lower(coalesce(v_payment.status, '')) = 'rejected' then
    return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected', 'already_processed', true);
  end if;
  if not exists (
    select 1 from public.payment_provider_settings s
    where s.code = v_payment.provider_code and s.method_type = 'bank_transfer'
  ) then
    raise exception 'Payment is not a manual bank transfer';
  end if;

  update public.payments
  set status = 'rejected',
      rejected_at = v_now,
      rejected_by = p_administrator_id,
      rejection_reason = v_reason,
      updated_at = v_now
  where id = v_payment.id;

  if v_payment.purpose = 'wallet_topup' and v_payment.wallet_topup_id is not null then
    update public.wallet_topups
    set status = 'rejected', failure_reason = v_reason, updated_at = v_now
    where id = v_payment.wallet_topup_id
      and status not in ('successful', 'reversed');
  elsif v_payment.purpose = 'order_payment' and v_payment.order_id is not null then
    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if not found then raise exception 'Order not found'; end if;
    if v_payment.user_id is not null and v_order.user_id is distinct from v_payment.user_id then
      raise exception 'Order owner mismatch';
    end if;
    if lower(coalesce(v_order.payment_status, '')) not in ('paid', 'confirmed', 'refunded')
       and lower(coalesce(v_order.status, '')) <> 'cancelled' then
      update public.orders
      set payment_status = 'awaiting_payment', updated_at = v_now
      where id = v_order.id;

      insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
      values (
        v_order.id,
        v_order.status,
        v_order.status,
        p_administrator_id,
        'Transfer could not be confirmed; order returned to awaiting payment'
      );
    end if;
  end if;

  return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected', 'already_processed', false);
end;
$$;

revoke all on function public.verify_manual_payment(integer, uuid) from public, anon, authenticated;
revoke all on function public.reject_manual_payment(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_manual_payment(integer, uuid) to service_role;
grant execute on function public.reject_manual_payment(integer, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Canonical status and logical-integrity constraints
-- ---------------------------------------------------------------------------

do $$
declare
  v_invalid text;
begin
  select string_agg(distinct coalesce(status, '<null>'), ', ' order by coalesce(status, '<null>'))
  into v_invalid
  from public.orders
  where status is null or status not in (
    'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'dispatched',
    'shipped', 'delivered', 'completed', 'stock_failed', 'payment_failed', 'cancelled'
  );
  if v_invalid is not null then
    raise exception 'Unsupported public.orders.status values: %', v_invalid;
  end if;

  select string_agg(distinct coalesce(payment_status, '<null>'), ', ' order by coalesce(payment_status, '<null>'))
  into v_invalid
  from public.orders
  where payment_status is null or payment_status not in (
    'unpaid', 'pending', 'awaiting_payment', 'awaiting_confirmation', 'confirmed',
    'rejected', 'processing', 'paid', 'failed', 'refunded'
  );
  if v_invalid is not null then
    raise exception 'Unsupported public.orders.payment_status values: %', v_invalid;
  end if;

  select string_agg(distinct coalesce(status, '<null>'), ', ' order by coalesce(status, '<null>'))
  into v_invalid
  from public.payments
  where status is null or status not in (
    'pending', 'awaiting_transfer', 'submitted', 'processing', 'verified',
    'success', 'successful', 'failed', 'cancelled', 'rejected', 'reversed',
    'expired', 'refunded'
  );
  if v_invalid is not null then
    raise exception 'Unsupported public.payments.status values: %', v_invalid;
  end if;
end;
$$;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'dispatched',
    'shipped', 'delivered', 'completed', 'stock_failed', 'payment_failed', 'cancelled'
  )) not valid;
alter table public.orders validate constraint orders_status_check;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in (
    'unpaid', 'pending', 'awaiting_payment', 'awaiting_confirmation', 'confirmed',
    'rejected', 'processing', 'paid', 'failed', 'refunded'
  )) not valid;
alter table public.orders validate constraint orders_payment_status_check;

alter table public.orders drop constraint if exists orders_payment_verified_state_check;
alter table public.orders add constraint orders_payment_verified_state_check
  check (coalesce(payment_verified, false) = false or payment_status in ('paid', 'confirmed')) not valid;
alter table public.orders validate constraint orders_payment_verified_state_check;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in (
    'pending', 'awaiting_transfer', 'submitted', 'processing', 'verified',
    'success', 'successful', 'failed', 'cancelled', 'rejected', 'reversed',
    'expired', 'refunded'
  )) not valid;
alter table public.payments validate constraint payments_status_check;

alter table public.payments drop constraint if exists payments_reconciliation_lengths_check;
alter table public.payments add constraint payments_reconciliation_lengths_check check (
  (payer_account_name is null or char_length(btrim(payer_account_name)) between 2 and 120)
  and (payer_bank_name is null or char_length(btrim(payer_bank_name)) between 2 and 120)
  and (customer_transaction_reference is null or char_length(btrim(customer_transaction_reference)) <= 120)
) not valid;
alter table public.payments validate constraint payments_reconciliation_lengths_check;

alter table public.payments drop constraint if exists payments_submitted_timestamp_check;
alter table public.payments add constraint payments_submitted_timestamp_check
  check (status <> 'submitted' or customer_submitted_at is not null) not valid;
alter table public.payments validate constraint payments_submitted_timestamp_check;

comment on column public.orders.status is
  'Fulfilment state: pending, confirmed, processing, ready_for_dispatch, dispatched, shipped, delivered, completed, stock_failed, payment_failed, cancelled.';
comment on column public.orders.payment_status is
  'Payment state: unpaid, pending, awaiting_payment, awaiting_confirmation, confirmed, rejected, processing, paid, failed, refunded.';
comment on column public.payments.status is
  'Payment attempt state: pending, awaiting_transfer, submitted, processing, verified, success, successful (legacy), failed, cancelled, rejected, reversed, expired, refunded.';

-- Normalize only stale, unsubmitted attempts. Submitted-before-expiry and all
-- successful/verified/refunded records are intentionally preserved.
do $$
declare
  v_payment_id integer;
begin
  for v_payment_id in
    select id
    from public.payments
    where expires_at < statement_timestamp()
      and status in ('pending', 'awaiting_transfer', 'processing', 'submitted')
      and not (
        status = 'submitted'
        and customer_submitted_at is not null
        and customer_submitted_at <= expires_at
      )
  loop
    perform public.expire_manual_payment_if_needed(v_payment_id, null);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
