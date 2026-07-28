-- Phase 1 payment and wallet launch controls.
-- Keeps gateway code dormant while enabling Moniepoint manual bank transfer.

create table if not exists public.payment_provider_settings (
  id bigserial primary key,
  code text not null unique,
  display_name text not null,
  method_type text not null,
  is_active boolean not null default false,
  is_recommended boolean not null default false,
  checkout_enabled boolean not null default false,
  wallet_topup_enabled boolean not null default false,
  display_order integer not null default 100,
  bank_name text,
  account_name text,
  account_number text,
  logo_url text,
  customer_notice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_settings_method_type_check check (method_type in ('bank_transfer', 'gateway')),
  constraint payment_provider_settings_bank_requirements_check check (
    method_type <> 'bank_transfer'
    or is_active = false
    or (
      nullif(btrim(coalesce(bank_name, '')), '') is not null
      and nullif(btrim(coalesce(account_name, '')), '') is not null
      and nullif(btrim(coalesce(account_number, '')), '') is not null
    )
  ),
  constraint payment_provider_settings_recommended_active_check check (is_recommended = false or is_active = true)
);

create unique index if not exists payment_provider_one_recommended_transfer_idx
  on public.payment_provider_settings (is_recommended)
  where method_type = 'bank_transfer' and is_active = true and is_recommended = true;

insert into public.payment_provider_settings (
  code, display_name, method_type, is_active, is_recommended, checkout_enabled, wallet_topup_enabled,
  display_order, bank_name, account_name, account_number, logo_url, customer_notice
) values
  (
    'moniepoint_transfer', 'Moniepoint Transfer', 'bank_transfer', true, true, true, true,
    1, '{{MONIEPOINT_BANK_NAME}}', '{{MONIEPOINT_ACCOUNT_NAME}}', '{{MONIEPOINT_ACCOUNT_NUMBER}}',
    '{{MONIEPOINT_LOGO_PATH}}', 'Transfer the exact amount to the account below.'
  ),
  (
    'opay_transfer', 'OPay Transfer', 'bank_transfer', false, false, false, false,
    2, null, null, null, '{{OPAY_LOGO_PATH}}', 'The Meal05 OPay business account will be available soon.'
  ),
  (
    'paystack', 'Card, USSD and Paystack', 'gateway', false, false, false, false,
    3, null, null, null, null, 'This option will become available after Meal05 activates gateway settlement for daily operations.'
  )
on conflict (code) do update set
  display_name = excluded.display_name,
  method_type = excluded.method_type,
  display_order = excluded.display_order,
  customer_notice = excluded.customer_notice,
  updated_at = now();

update public.wallet_settings
set wallet_enabled = true,
    wallet_payment_enabled = true,
    wallet_refunds_enabled = true,
    paystack_topups_enabled = false,
    opay_topups_enabled = false,
    monnify_topups_enabled = true,
    minimum_topup_amount = coalesce(minimum_topup_amount, 1000),
    maximum_topup_amount = coalesce(maximum_topup_amount, 500000),
    daily_topup_limit = coalesce(daily_topup_limit, 500000),
    updated_at = now()
where id = true;

alter table public.payments
  add column if not exists reference text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists purpose text,
  add column if not exists provider_code text references public.payment_provider_settings(code),
  add column if not exists currency text not null default 'NGN',
  add column if not exists wallet_topup_id uuid references public.wallet_topups(id) on delete set null,
  add column if not exists payer_account_name text,
  add column if not exists payer_bank_name text,
  add column if not exists customer_transaction_reference text,
  add column if not exists proof_storage_path text,
  add column if not exists customer_submitted_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.payments
set reference = coalesce(reference, transaction_ref),
    provider_code = coalesce(provider_code, method),
    purpose = coalesce(purpose, 'order_payment'),
    currency = coalesce(currency, currency_code, 'NGN')
where reference is null or provider_code is null or purpose is null;

create unique index if not exists payments_reference_unique_idx
  on public.payments (reference)
  where reference is not null;

create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_provider_created_idx on public.payments (provider_code, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_positive_check') then
    alter table public.payments add constraint payments_amount_positive_check check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_purpose_check') then
    alter table public.payments add constraint payments_purpose_check check (purpose is null or purpose in ('order_payment', 'wallet_topup'));
  end if;
end $$;

create unique index if not exists payments_one_active_order_payment_idx
  on public.payments (order_id)
  where purpose = 'order_payment'
    and order_id is not null
    and status not in ('cancelled', 'rejected', 'expired', 'failed', 'refunded');

alter table public.wallet_topups drop constraint if exists wallet_topups_provider_check;
alter table public.wallet_topups
  add constraint wallet_topups_provider_check check (provider in ('paystack', 'monnify', 'opay', 'moniepoint_transfer', 'opay_transfer'));

alter table public.wallet_topups drop constraint if exists wallet_topups_status_check;
alter table public.wallet_topups
  add constraint wallet_topups_status_check check (status in ('pending', 'awaiting_transfer', 'submitted', 'processing', 'successful', 'failed', 'cancelled', 'rejected', 'reversed', 'expired'));

alter table public.payments enable row level security;
alter table public.payment_provider_settings enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists payment_provider_settings_public_read on public.payment_provider_settings;
create policy payment_provider_settings_public_read on public.payment_provider_settings
  for select to anon, authenticated
  using (true);

drop policy if exists payment_provider_settings_admin_all on public.payment_provider_settings;
create policy payment_provider_settings_admin_all on public.payment_provider_settings
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

grant select on table public.payment_provider_settings to anon, authenticated;
grant all on table public.payment_provider_settings to service_role;
grant select on table public.payments to authenticated;
grant all on table public.payments to service_role;

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
  v_existing_tx public.wallet_transactions%rowtype;
  v_reference text;
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
    return jsonb_build_object('already_processed', true, 'payment_id', v_payment.id, 'reference', v_payment.reference);
  end if;

  if v_payment.status not in ('awaiting_transfer', 'submitted', 'pending') then
    raise exception 'Payment cannot be verified from status %', v_payment.status;
  end if;

  v_reference := coalesce(v_payment.reference, v_payment.transaction_ref);

  if v_payment.purpose = 'wallet_topup' then
    select * into v_topup
    from public.wallet_topups
    where id = v_payment.wallet_topup_id
    for update;

    if not found then
      raise exception 'Wallet top-up not found';
    end if;

    perform public.ensure_wallet_account(v_payment.user_id, coalesce(v_payment.currency, v_payment.currency_code, 'NGN'));

    select * into v_existing_tx
    from public.wallet_transactions
    where wallet_topup_id = v_topup.id
      and type = 'credit'
      and reason = 'topup'
    limit 1;

    if not found then
      insert into public.wallet_transactions (
        user_id, amount, type, reason, wallet_topup_id, provider, provider_reference,
        idempotency_key, external_reference, metadata, note, created_by, created_at
      ) values (
        v_payment.user_id, v_payment.amount, 'credit', 'topup', v_topup.id, v_payment.provider_code, v_reference,
        'manual-payment:' || v_payment.id::text, v_reference,
        jsonb_build_object('currencyCode', coalesce(v_payment.currency, 'NGN')),
        'Verified Moniepoint wallet deposit', p_administrator_id, now()
      );
    end if;

    update public.wallet_topups
    set status = 'successful',
        provider_reference = coalesce(provider_reference, v_reference),
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = v_topup.id;
  elsif v_payment.purpose = 'order_payment' then
    select * into v_order
    from public.orders
    where id = v_payment.order_id
    for update;

    if not found then
      raise exception 'Order not found';
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
      paid_at = now(),
      verified_at = now(),
      verified_by = p_administrator_id,
      updated_at = now()
  where id = v_payment.id;

  return jsonb_build_object('already_processed', false, 'payment_id', v_payment.id, 'reference', v_reference);
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

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status in ('verified', 'success') then
    raise exception 'Verified payment cannot be rejected';
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

  return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected');
end;
$$;

revoke all on function public.verify_manual_payment(integer, uuid) from public, anon, authenticated;
revoke all on function public.reject_manual_payment(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_manual_payment(integer, uuid) to service_role;
grant execute on function public.reject_manual_payment(integer, uuid, text) to service_role;
