-- Meal05 Balance closed-loop stored-value foundation.
-- Disabled by default until business limits, provider approvals, and compliance review are complete.

create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency_code text not null default 'NGN',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_accounts_currency_check check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint wallet_accounts_status_check check (status in ('active', 'restricted', 'suspended', 'closed'))
);

comment on table public.wallet_accounts is 'Closed-loop Meal05 Balance accounts. Ledger remains the financial source of truth.';

create table if not exists public.wallet_settings (
  id boolean primary key default true,
  wallet_enabled boolean not null default false,
  paystack_topups_enabled boolean not null default false,
  monnify_topups_enabled boolean not null default false,
  opay_topups_enabled boolean not null default false,
  wallet_payment_enabled boolean not null default false,
  wallet_refunds_enabled boolean not null default false,
  mixed_payment_enabled boolean not null default false,
  minimum_topup_amount numeric(14,2),
  maximum_topup_amount numeric(14,2),
  daily_topup_limit numeric(14,2),
  maximum_wallet_balance numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_settings_singleton check (id = true),
  constraint wallet_settings_positive_limits check (
    (minimum_topup_amount is null or minimum_topup_amount > 0) and
    (maximum_topup_amount is null or maximum_topup_amount > 0) and
    (daily_topup_limit is null or daily_topup_limit > 0) and
    (maximum_wallet_balance is null or maximum_wallet_balance > 0) and
    (minimum_topup_amount is null or maximum_topup_amount is null or minimum_topup_amount <= maximum_topup_amount)
  )
);

insert into public.wallet_settings (id)
values (true)
on conflict (id) do nothing;

comment on table public.wallet_settings is 'Admin-controlled Meal05 Balance rollout and limit settings. Defaults keep wallet disabled.';

create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  amount numeric(14,2) not null,
  currency_code text not null default 'NGN',
  status text not null default 'pending',
  merchant_reference text not null,
  provider_reference text,
  provider_transaction_id text,
  authorization_url text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint wallet_topups_amount_check check (amount > 0),
  constraint wallet_topups_currency_check check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint wallet_topups_provider_check check (provider in ('paystack', 'monnify', 'opay')),
  constraint wallet_topups_status_check check (status in ('pending', 'processing', 'successful', 'failed', 'cancelled', 'reversed')),
  constraint wallet_topups_merchant_reference_key unique (merchant_reference)
);

create unique index if not exists wallet_topups_provider_reference_key
  on public.wallet_topups (provider, provider_reference)
  where provider_reference is not null;
create index if not exists wallet_topups_user_created_idx on public.wallet_topups (user_id, created_at desc);
create index if not exists wallet_topups_status_idx on public.wallet_topups (status, updated_at);

comment on table public.wallet_topups is 'Provider checkout attempts for funding closed-loop Meal05 Balance.';

alter table public.wallet_transactions
  add column if not exists wallet_topup_id uuid references public.wallet_topups(id) on delete set null,
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists idempotency_key text,
  add column if not exists external_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass
      and conname = 'wallet_transactions_signed_amount_check'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_transactions_signed_amount_check
      check ((type = 'credit' and amount > 0) or (type = 'debit' and amount < 0));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass
      and conname = 'wallet_transactions_reason_check'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_transactions_reason_check
      check (reason in ('topup', 'order_payment', 'order_refund', 'admin_adjustment', 'provider_reversal', 'promotional_credit'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass
      and conname = 'wallet_transactions_provider_check'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_transactions_provider_check
      check (provider is null or provider in ('paystack', 'monnify', 'opay'));
  end if;
end $$;

create unique index if not exists wallet_transactions_topup_credit_once_idx
  on public.wallet_transactions (wallet_topup_id)
  where wallet_topup_id is not null and type = 'credit' and reason = 'topup';

create unique index if not exists wallet_transactions_topup_reversal_once_idx
  on public.wallet_transactions (wallet_topup_id)
  where wallet_topup_id is not null and type = 'debit' and reason = 'provider_reversal';

create unique index if not exists wallet_transactions_provider_reference_once_idx
  on public.wallet_transactions (provider, provider_reference)
  where provider is not null and provider_reference is not null and type = 'credit' and reason = 'topup';

create unique index if not exists wallet_transactions_idempotency_once_idx
  on public.wallet_transactions (user_id, idempotency_key)
  where idempotency_key is not null;

create or replace view public.vw_wallet_balances with (security_invoker = on) as
select
  user_id,
  coalesce(sum(amount), 0)::numeric as balance,
  max(created_at) as last_activity
from public.wallet_transactions
group by user_id;

alter table public.wallet_transactions enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_settings enable row level security;
alter table public.wallet_topups enable row level security;

drop policy if exists wallet_admin_all on public.wallet_transactions;
drop policy if exists wallet_select_own on public.wallet_transactions;
create policy wallet_select_own on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists wallet_accounts_select_own on public.wallet_accounts;
create policy wallet_accounts_select_own on public.wallet_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists wallet_accounts_admin_all on public.wallet_accounts;
create policy wallet_accounts_admin_all on public.wallet_accounts
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists wallet_settings_admin_all on public.wallet_settings;
create policy wallet_settings_admin_all on public.wallet_settings
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists wallet_topups_select_own on public.wallet_topups;
create policy wallet_topups_select_own on public.wallet_topups
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists wallet_topups_admin_all on public.wallet_topups;
create policy wallet_topups_admin_all on public.wallet_topups
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

revoke all on table public.wallet_transactions from anon, authenticated;
revoke all on table public.wallet_accounts from anon, authenticated;
revoke all on table public.wallet_settings from anon, authenticated;
revoke all on table public.wallet_topups from anon, authenticated;
revoke all on table public.vw_wallet_balances from anon, authenticated;

grant select on table public.wallet_transactions to authenticated;
grant select on table public.wallet_accounts to authenticated;
grant select on table public.wallet_topups to authenticated;
grant select on table public.vw_wallet_balances to authenticated;

grant all on table public.wallet_transactions to service_role;
grant all on table public.wallet_accounts to service_role;
grant all on table public.wallet_settings to service_role;
grant all on table public.wallet_topups to service_role;
grant select on table public.vw_wallet_balances to service_role;

create or replace function public.ensure_wallet_account(
  p_user_id uuid,
  p_currency_code text default 'NGN'
)
returns public.wallet_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.wallet_accounts%rowtype;
  v_currency text := upper(btrim(coalesce(p_currency_code, 'NGN')));
begin
  if p_user_id is null then
    raise exception 'Wallet user is required';
  end if;
  if length(v_currency) <> 3 then
    raise exception 'Invalid wallet currency';
  end if;

  insert into public.wallet_accounts (user_id, currency_code, status, created_at, updated_at)
  values (p_user_id, v_currency, 'active', now(), now())
  on conflict (user_id) do nothing;

  select * into v_account
  from public.wallet_accounts
  where user_id = p_user_id;

  if v_account.currency_code <> v_currency then
    raise exception 'Wallet currency mismatch';
  end if;

  return v_account;
end;
$$;

create or replace function public.get_wallet_balance(
  p_user_id uuid
)
returns numeric
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(sum(amount), 0)::numeric
  from public.wallet_transactions
  where user_id = p_user_id;
$$;

create or replace function public.credit_wallet_topup(
  p_topup_id uuid,
  p_provider_reference text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup public.wallet_topups%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_provider_reference text := btrim(coalesce(p_provider_reference, ''));
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_balance numeric;
begin
  if p_topup_id is null then
    raise exception 'Top-up id is required';
  end if;
  if v_provider_reference = '' then
    raise exception 'Provider reference is required';
  end if;

  select * into v_topup
  from public.wallet_topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'Top-up not found';
  end if;

  if v_topup.provider_reference is not null and v_topup.provider_reference <> v_provider_reference then
    raise exception 'Provider reference mismatch';
  end if;

  perform public.ensure_wallet_account(v_topup.user_id, v_topup.currency_code);

  select * into v_account
  from public.wallet_accounts
  where user_id = v_topup.user_id
  for update;

  if v_account.status <> 'active' then
    raise exception 'Wallet is not active';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where wallet_topup_id = v_topup.id
    and type = 'credit'
    and reason = 'topup'
  limit 1;

  if found then
    return jsonb_build_object(
      'already_processed', true,
      'transaction_id', v_existing.id,
      'balance', public.get_wallet_balance(v_topup.user_id)
    );
  end if;

  if v_topup.status in ('failed', 'cancelled', 'reversed') then
    raise exception 'Top-up cannot be credited from status %', v_topup.status;
  end if;

  if v_idempotency is not null then
    select * into v_existing
    from public.wallet_transactions
    where user_id = v_topup.user_id and idempotency_key = v_idempotency
    limit 1;
    if found then
      raise exception 'Idempotency key has already been used';
    end if;
  end if;

  update public.wallet_topups
  set status = 'successful',
      provider_reference = v_provider_reference,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = v_topup.id;

  insert into public.wallet_transactions (
    user_id,
    amount,
    type,
    reason,
    wallet_topup_id,
    provider,
    provider_reference,
    idempotency_key,
    external_reference,
    metadata,
    note,
    created_at
  ) values (
    v_topup.user_id,
    v_topup.amount,
    'credit',
    'topup',
    v_topup.id,
    v_topup.provider,
    v_provider_reference,
    v_idempotency,
    v_topup.merchant_reference,
    jsonb_build_object('currencyCode', v_topup.currency_code),
    'Meal05 Balance top-up',
    now()
  )
  returning * into v_existing;

  v_balance := public.get_wallet_balance(v_topup.user_id);

  return jsonb_build_object(
    'already_processed', false,
    'transaction_id', v_existing.id,
    'balance', v_balance
  );
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
  v_item record;
  v_stock numeric;
  v_variant_market uuid;
  v_item_count integer;
  v_wallet_enabled boolean;
  v_payment_enabled boolean;
begin
  if p_order_id is null or p_user_id is null then
    raise exception 'Order and user are required';
  end if;
  if v_idempotency is null then
    raise exception 'Idempotency key is required';
  end if;

  select wallet_enabled, wallet_payment_enabled
    into v_wallet_enabled, v_payment_enabled
  from public.wallet_settings
  where id = true;

  if coalesce(v_wallet_enabled, false) is not true or coalesce(v_payment_enabled, false) is not true then
    raise exception 'Meal05 Balance payments are disabled';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.user_id <> p_user_id then
    raise exception 'Forbidden';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where user_id = p_user_id and idempotency_key = v_idempotency
  limit 1;

  if found then
    if v_existing.type = 'debit' and v_existing.reason = 'order_payment' and v_existing.order_id = p_order_id then
      return jsonb_build_object(
        'already_processed', true,
        'transaction_id', v_existing.id,
        'balance', public.get_wallet_balance(p_user_id),
        'payment_reference', v_existing.external_reference
      );
    end if;
    raise exception 'Idempotency key has already been used';
  end if;

  if lower(coalesce(v_order.payment_status, '')) = 'paid' then
    raise exception 'Order is already paid';
  end if;
  if v_order.total is null or v_order.total <= 0 then
    raise exception 'Order total must be greater than zero';
  end if;
  if upper(coalesce(v_order.currency_code, 'NGN')) <> 'NGN' then
    raise exception 'Wallet currently supports NGN orders only';
  end if;

  select count(*) into v_item_count
  from public.order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'Order has no items';
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and (variant_id is null or quantity is null or quantity <= 0)
  ) then
    raise exception 'Order contains an invalid item';
  end if;

  perform public.ensure_wallet_account(p_user_id, coalesce(v_order.currency_code, 'NGN'));

  select * into v_account
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if v_account.status <> 'active' then
    raise exception 'Wallet is not active';
  end if;

  v_balance := public.get_wallet_balance(p_user_id);
  if v_balance < v_order.total then
    raise exception 'Insufficient Meal05 Balance';
  end if;

  for v_item in
    select variant_id, sum(quantity)::numeric as quantity
    from public.order_items
    where order_id = p_order_id
    group by variant_id
    order by variant_id
  loop
    select stock_count, market_id into v_stock, v_variant_market
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

    update public.product_variants
    set stock_count = stock_count - v_item.quantity,
        updated_at = now()
    where id = v_item.variant_id;

    insert into public.stock_ledger (variant_id, change_qty, reason, source, note)
    values (
      v_item.variant_id,
      -v_item.quantity,
      'order_deduction',
      'order:' || p_order_id::text,
      'Meal05 Balance payment'
    );
  end loop;

  v_reference := 'WALLET-' || p_order_id::text || '-' || replace(v_idempotency, ':', '-');

  insert into public.wallet_transactions (
    user_id,
    amount,
    type,
    reason,
    order_id,
    idempotency_key,
    external_reference,
    metadata,
    note,
    created_at
  ) values (
    p_user_id,
    -v_order.total,
    'debit',
    'order_payment',
    p_order_id,
    v_idempotency,
    v_reference,
    jsonb_build_object('currencyCode', v_order.currency_code),
    'Meal05 Balance order payment',
    now()
  )
  returning * into v_existing;

  insert into public.payments (
    order_id, amount, method, status, transaction_ref, paid_at, currency_code
  ) values (
    p_order_id, v_order.total, 'wallet', 'success', v_reference, now(), coalesce(v_order.currency_code, 'NGN')
  )
  on conflict (transaction_ref) do update
    set status = 'success',
        paid_at = excluded.paid_at;

  update public.orders
  set payment_status = 'paid',
      payment_method = 'wallet',
      payment_reference = v_reference,
      payment_verified = true,
      status = 'processing',
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'already_processed', false,
    'transaction_id', v_existing.id,
    'balance', public.get_wallet_balance(p_user_id),
    'payment_reference', v_reference
  );
end;
$$;

create or replace function public.refund_order_to_wallet(
  p_order_id integer,
  p_refund_id bigint,
  p_amount numeric,
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
  v_refund public.refunds%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_refunds_enabled boolean;
begin
  if p_order_id is null or p_refund_id is null or p_user_id is null then
    raise exception 'Order, refund, and user are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;
  if v_idempotency is null then
    raise exception 'Idempotency key is required';
  end if;

  select wallet_refunds_enabled into v_refunds_enabled
  from public.wallet_settings where id = true;
  if coalesce(v_refunds_enabled, false) is not true then
    raise exception 'Wallet refunds are disabled';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> p_user_id then
    raise exception 'Order not found or forbidden';
  end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found';
  end if;
  if v_refund.order_id <> p_order_id then
    raise exception 'Refund does not belong to order';
  end if;
  if v_refund.method <> 'wallet' then
    raise exception 'Refund method is not wallet';
  end if;
  if v_refund.amount <> p_amount then
    raise exception 'Refund amount mismatch';
  end if;
  if v_refund.status not in ('approved', 'processed') then
    raise exception 'Refund is not approved';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where user_id = p_user_id and idempotency_key = v_idempotency
  limit 1;

  if found then
    if v_existing.type = 'credit' and v_existing.reason = 'order_refund' and v_existing.refund_id = p_refund_id then
      return jsonb_build_object('already_processed', true, 'transaction_id', v_existing.id, 'balance', public.get_wallet_balance(p_user_id));
    end if;
    raise exception 'Idempotency key has already been used';
  end if;

  perform public.ensure_wallet_account(p_user_id, coalesce(v_refund.currency_code, 'NGN'));
  select * into v_account from public.wallet_accounts where user_id = p_user_id for update;
  if v_account.status not in ('active', 'restricted') then
    raise exception 'Wallet cannot receive refunds';
  end if;

  insert into public.wallet_transactions (
    user_id, amount, type, reason, order_id, refund_id, idempotency_key, metadata, note
  ) values (
    p_user_id, p_amount, 'credit', 'order_refund', p_order_id, p_refund_id, v_idempotency,
    jsonb_build_object('currencyCode', v_refund.currency_code), 'Meal05 Balance refund'
  )
  returning * into v_existing;

  update public.refunds
  set status = 'processed', processed_at = coalesce(processed_at, now())
  where id = p_refund_id;

  return jsonb_build_object('already_processed', false, 'transaction_id', v_existing.id, 'balance', public.get_wallet_balance(p_user_id));
end;
$$;

create or replace function public.reverse_wallet_topup(
  p_topup_id uuid,
  p_provider_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup public.wallet_topups%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_balance numeric;
  v_recovered numeric;
  v_shortfall numeric;
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_provider_reference text := btrim(coalesce(p_provider_reference, ''));
begin
  if p_topup_id is null then
    raise exception 'Top-up id is required';
  end if;
  if v_idempotency is null then
    raise exception 'Idempotency key is required';
  end if;
  if v_provider_reference = '' then
    raise exception 'Provider reference is required';
  end if;

  select * into v_topup from public.wallet_topups where id = p_topup_id for update;
  if not found then
    raise exception 'Top-up not found';
  end if;

  if v_topup.provider_reference is not null and v_topup.provider_reference <> v_provider_reference then
    raise exception 'Provider reference mismatch';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where wallet_topup_id = v_topup.id and type = 'debit' and reason = 'provider_reversal'
  limit 1;

  if found then
    return jsonb_build_object('already_processed', true, 'transaction_id', v_existing.id, 'balance', public.get_wallet_balance(v_topup.user_id));
  end if;

  if v_topup.status = 'reversed' and coalesce(v_topup.metadata->>'reversalIdempotencyKey', '') = v_idempotency then
    return jsonb_build_object('already_processed', true, 'transaction_id', null, 'balance', public.get_wallet_balance(v_topup.user_id));
  end if;

  if v_topup.status <> 'successful' then
    raise exception 'Only successful top-ups can be reversed';
  end if;

  perform public.ensure_wallet_account(v_topup.user_id, v_topup.currency_code);
  select * into v_account from public.wallet_accounts where user_id = v_topup.user_id for update;

  select * into v_existing
  from public.wallet_transactions
  where user_id = v_topup.user_id and idempotency_key = v_idempotency
  limit 1;
  if found then
    raise exception 'Idempotency key has already been used';
  end if;

  v_balance := public.get_wallet_balance(v_topup.user_id);
  v_recovered := least(greatest(v_balance, 0), v_topup.amount);
  v_shortfall := greatest(v_topup.amount - v_recovered, 0);

  if v_recovered > 0 then
    insert into public.wallet_transactions (
      user_id, amount, type, reason, wallet_topup_id, provider, provider_reference,
      idempotency_key, metadata, note
    ) values (
      v_topup.user_id, -v_recovered, 'debit', 'provider_reversal', v_topup.id,
      v_topup.provider, v_provider_reference, v_idempotency,
      jsonb_build_object('recoveredAmount', v_recovered, 'shortfall', v_shortfall),
      'Provider top-up reversal'
    )
    returning * into v_existing;
  end if;

  if v_shortfall > 0 then
    update public.wallet_accounts
    set status = 'restricted', updated_at = now()
    where user_id = v_topup.user_id;
  end if;

  update public.wallet_topups
  set status = 'reversed',
      provider_reference = v_provider_reference,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reversalIdempotencyKey', v_idempotency,
        'recoveredAmount', v_recovered,
        'reversalShortfall', v_shortfall
      ),
      updated_at = now()
  where id = v_topup.id;

  return jsonb_build_object(
    'already_processed', false,
    'transaction_id', case when v_recovered > 0 then v_existing.id else null end,
    'balance', public.get_wallet_balance(v_topup.user_id),
    'wallet_restricted', (v_shortfall > 0),
    'reversal_shortfall', v_shortfall
  );
end;
$$;

revoke all on function public.ensure_wallet_account(uuid, text) from public, anon, authenticated;
revoke all on function public.get_wallet_balance(uuid) from public, anon, authenticated;
revoke all on function public.credit_wallet_topup(uuid, text, text) from public, anon, authenticated;
revoke all on function public.debit_wallet_for_order(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_order_to_wallet(integer, bigint, numeric, uuid, text) from public, anon, authenticated;
revoke all on function public.reverse_wallet_topup(uuid, text, text) from public, anon, authenticated;

grant execute on function public.ensure_wallet_account(uuid, text) to service_role;
grant execute on function public.get_wallet_balance(uuid) to service_role;
grant execute on function public.credit_wallet_topup(uuid, text, text) to service_role;
grant execute on function public.debit_wallet_for_order(integer, uuid, text) to service_role;
grant execute on function public.refund_order_to_wallet(integer, bigint, numeric, uuid, text) to service_role;
grant execute on function public.reverse_wallet_topup(uuid, text, text) to service_role;;
