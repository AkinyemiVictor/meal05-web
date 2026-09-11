-- Tag Buy batches, capacity reservations, and paid commitments.
-- V1 deliberately keeps each cart/order homogeneous: standard OR one Tag batch.

create table public.tag_batches (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  variant_id bigint not null references public.product_variants(id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'open', 'closed', 'procurement', 'fulfilled', 'failed', 'cancelled'
  )),
  tag_price numeric(12,2) not null check (tag_price >= 0),
  standard_price_at_open numeric(12,2) not null check (standard_price_at_open >= 0),
  target_quantity numeric(12,3) not null check (target_quantity > 0),
  minimum_viable_quantity numeric(12,3) not null check (minimum_viable_quantity > 0),
  maximum_quantity numeric(12,3) not null check (maximum_quantity > 0),
  closes_at timestamptz not null,
  expected_procurement_at timestamptz not null,
  failure_policy text not null default 'refund' check (failure_policy in ('refund', 'carry_forward')),
  carry_forward_batch_id uuid references public.tag_batches(id) on delete restrict,
  target_reached_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_batches_quantity_order_check check (
    minimum_viable_quantity <= target_quantity
    and target_quantity <= maximum_quantity
  ),
  constraint tag_batches_procurement_after_close_check check (expected_procurement_at > closes_at),
  constraint tag_batches_carry_forward_check check (
    (failure_policy = 'refund' and carry_forward_batch_id is null)
    or failure_policy = 'carry_forward'
  ),
  constraint tag_batches_not_self_forwarding_check check (carry_forward_batch_id is null or carry_forward_batch_id <> id)
);

create unique index tag_batches_one_live_variant_idx
  on public.tag_batches (market_id, variant_id)
  where status = 'open';
create index tag_batches_market_status_close_idx on public.tag_batches (market_id, status, closes_at);
create index tag_batches_product_status_idx on public.tag_batches (product_id, status);

create table public.tag_commitments (
  id uuid primary key default gen_random_uuid(),
  tag_batch_id uuid not null references public.tag_batches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id integer references public.orders(id) on delete cascade,
  order_item_id integer references public.order_items(id) on delete cascade,
  reservation_key text not null,
  status text not null default 'reserved' check (status in (
    'reserved', 'awaiting_verification', 'committed', 'refund_pending',
    'refunded', 'carry_forwarded', 'cancelled', 'expired'
  )),
  quantity numeric(12,3) not null check (quantity > 0),
  tag_price_snapshot numeric(12,2) not null check (tag_price_snapshot >= 0),
  currency_code text not null default 'NGN',
  reservation_expires_at timestamptz,
  committed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  carried_forward_to_commitment_id uuid references public.tag_commitments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_commitments_reservation_key_length check (char_length(btrim(reservation_key)) between 8 and 200),
  unique (tag_batch_id, user_id, reservation_key)
);

create index tag_commitments_batch_status_idx on public.tag_commitments (tag_batch_id, status);
create index tag_commitments_user_created_idx on public.tag_commitments (user_id, created_at desc);
create index tag_commitments_order_idx on public.tag_commitments (order_id) where order_id is not null;

alter table public.cart_items
  add column procurement_mode text not null default 'standard',
  add column tag_batch_id uuid references public.tag_batches(id) on delete restrict,
  add column tag_price_at_add numeric(12,2);

alter table public.cart_items
  add constraint cart_items_procurement_mode_check check (procurement_mode in ('standard', 'tag')),
  add constraint cart_items_tag_metadata_check check (
    (procurement_mode = 'standard' and tag_batch_id is null and tag_price_at_add is null)
    or (procurement_mode = 'tag' and tag_batch_id is not null and tag_price_at_add is not null and tag_price_at_add >= 0)
  );

alter table public.orders
  add column procurement_mode text not null default 'standard',
  add column tag_acknowledged_at timestamptz;

alter table public.orders
  add constraint orders_procurement_mode_check check (procurement_mode in ('standard', 'tag')),
  add constraint orders_tag_acknowledgement_check check (
    procurement_mode = 'standard' or tag_acknowledged_at is not null
  );

alter table public.order_items
  add column procurement_mode text not null default 'standard',
  add column tag_batch_id uuid references public.tag_batches(id) on delete restrict,
  add column tag_price_snapshot numeric(12,2),
  add column tag_closes_at_snapshot timestamptz,
  add column expected_procurement_at_snapshot timestamptz;

alter table public.order_items
  add constraint order_items_procurement_mode_check check (procurement_mode in ('standard', 'tag')),
  add constraint order_items_tag_metadata_check check (
    (procurement_mode = 'standard' and tag_batch_id is null and tag_price_snapshot is null
      and tag_closes_at_snapshot is null and expected_procurement_at_snapshot is null)
    or (procurement_mode = 'tag' and tag_batch_id is not null and tag_price_snapshot is not null
      and tag_price_snapshot >= 0 and tag_closes_at_snapshot is not null
      and expected_procurement_at_snapshot is not null)
  );

comment on column public.orders.procurement_mode is 'Commercial sourcing mode: standard stock purchase or capacity-backed Tag Buy.';
comment on column public.order_items.price is 'Actual unit price charged at checkout, including the Tag price when procurement_mode is tag.';
comment on column public.tag_batches.target_reached_at is 'First time paid commitments reached target_quantity; the batch may remain open until capacity or deadline.';

alter table public.tag_batches enable row level security;
alter table public.tag_commitments enable row level security;

revoke all on table public.tag_batches from anon, authenticated;
grant select on table public.tag_batches to anon, authenticated;
grant select, insert, update, delete on table public.tag_batches to service_role;

revoke all on table public.tag_commitments from anon, authenticated;
grant select on table public.tag_commitments to authenticated;
grant select, insert, update, delete on table public.tag_commitments to service_role;

create policy tag_batches_public_read
  on public.tag_batches for select to anon, authenticated
  using (status in ('open', 'closed', 'procurement', 'fulfilled', 'failed', 'cancelled'));

create policy tag_commitments_owner_read
  on public.tag_commitments for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.tag_batch_progress
with (security_invoker = true)
as
select
  b.*,
  coalesce(sum(c.quantity) filter (where c.status in ('committed', 'refund_pending')), 0)::numeric(12,3) as committed_quantity,
  coalesce(sum(c.quantity) filter (where c.status in ('reserved', 'awaiting_verification')), 0)::numeric(12,3) as reserved_quantity,
  count(distinct c.user_id) filter (where c.status in ('committed', 'refund_pending'))::integer as shopper_count,
  greatest(
    b.maximum_quantity - coalesce(sum(c.quantity) filter (
      where c.status in ('reserved', 'awaiting_verification', 'committed', 'refund_pending')
    ), 0),
    0
  )::numeric(12,3) as remaining_quantity,
  least(
    100,
    round(
      100 * coalesce(sum(c.quantity) filter (where c.status in ('committed', 'refund_pending')), 0)
      / nullif(b.target_quantity, 0),
      1
    )
  ) as progress_percent
from public.tag_batches b
left join public.tag_commitments c on c.tag_batch_id = b.id
group by b.id;

revoke all on table public.tag_batch_progress from public, anon, authenticated;
grant select on table public.tag_batch_progress to service_role;

create or replace function public.expire_tag_reservations(p_batch_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.tag_commitments
  set status = 'expired', cancelled_at = coalesce(cancelled_at, statement_timestamp()), updated_at = statement_timestamp()
  where status = 'reserved'
    and reservation_expires_at is not null
    and reservation_expires_at <= statement_timestamp()
    and (p_batch_id is null or tag_batch_id = p_batch_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.reserve_tag_capacity(
  p_batch_id uuid,
  p_user_id uuid,
  p_quantity numeric,
  p_reservation_key text,
  p_hold_minutes integer default 20
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.tag_batches%rowtype;
  v_existing public.tag_commitments%rowtype;
  v_used numeric;
  v_commitment public.tag_commitments%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_batch_id is null or p_user_id is null then raise exception 'Tag batch and user are required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Tag quantity must be positive'; end if;
  if char_length(btrim(coalesce(p_reservation_key, ''))) not between 8 and 200 then
    raise exception 'Tag reservation key is invalid';
  end if;
  if p_hold_minutes is null or p_hold_minutes not between 5 and 1440 then
    raise exception 'Tag hold window must be between 5 and 1440 minutes';
  end if;

  select * into v_batch from public.tag_batches where id = p_batch_id for update;
  if not found then raise exception 'Tag batch not found'; end if;

  perform public.expire_tag_reservations(p_batch_id);
  select * into v_existing
  from public.tag_commitments
  where tag_batch_id = p_batch_id and user_id = p_user_id and reservation_key = btrim(p_reservation_key)
  for update;
  if found then
    if v_existing.quantity is distinct from p_quantity then
      raise exception 'Tag reservation was reused with a different quantity';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('already_processed', true);
  end if;

  if v_batch.status <> 'open' or v_batch.closes_at <= v_now then raise exception 'This Tag Buy is closed'; end if;

  select coalesce(sum(quantity), 0) into v_used
  from public.tag_commitments
  where tag_batch_id = p_batch_id
    and status in ('reserved', 'awaiting_verification', 'committed', 'refund_pending');
  if v_used + p_quantity > v_batch.maximum_quantity then
    raise exception 'Only % remains in this Tag Buy', greatest(v_batch.maximum_quantity - v_used, 0);
  end if;

  insert into public.tag_commitments (
    tag_batch_id, user_id, reservation_key, status, quantity, tag_price_snapshot,
    currency_code, reservation_expires_at
  )
  select v_batch.id, p_user_id, btrim(p_reservation_key), 'reserved', p_quantity,
    v_batch.tag_price, m.currency_code, v_now + make_interval(mins => p_hold_minutes)
  from public.markets m where m.id = v_batch.market_id
  returning * into v_commitment;

  return to_jsonb(v_commitment) || jsonb_build_object('already_processed', false);
end;
$$;

create or replace function public.bind_tag_commitment_to_order(
  p_batch_id uuid,
  p_user_id uuid,
  p_reservation_key text,
  p_order_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_commitment public.tag_commitments%rowtype;
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
begin
  select * into v_commitment from public.tag_commitments
  where tag_batch_id = p_batch_id and user_id = p_user_id and reservation_key = btrim(p_reservation_key)
  for update;
  if not found or v_commitment.status <> 'reserved' then raise exception 'Active Tag reservation not found'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id or v_order.procurement_mode <> 'tag' then
    raise exception 'Tag order does not match reservation';
  end if;

  select * into v_item from public.order_items
  where order_id = p_order_id and tag_batch_id = p_batch_id and procurement_mode = 'tag';
  if not found or v_item.quantity is distinct from v_commitment.quantity
     or v_item.price is distinct from v_commitment.tag_price_snapshot then
    raise exception 'Tag order item does not match reservation';
  end if;

  update public.tag_commitments
  set order_id = p_order_id,
      order_item_id = v_item.id,
      status = 'awaiting_verification',
      reservation_expires_at = null,
      updated_at = statement_timestamp()
  where id = v_commitment.id
  returning * into v_commitment;
  return to_jsonb(v_commitment);
end;
$$;

create or replace function public.confirm_tag_commitments_for_order(p_order_id integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_batch_id uuid;
  v_committed numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.procurement_mode <> 'tag' then
    return jsonb_build_object('order_id', p_order_id, 'tag', false, 'already_processed', true);
  end if;

  select tag_batch_id into v_batch_id from public.tag_commitments
  where order_id = p_order_id and status in ('awaiting_verification', 'committed', 'refund_pending')
  limit 1;
  if v_batch_id is null then raise exception 'Tag commitment not found for order'; end if;
  perform 1 from public.tag_batches where id = v_batch_id for update;
  if not found then raise exception 'Tag batch not found'; end if;

  update public.tag_commitments
  set status = 'committed', committed_at = coalesce(committed_at, statement_timestamp()), updated_at = statement_timestamp()
  where order_id = p_order_id and status = 'awaiting_verification';

  select coalesce(sum(quantity), 0) into v_committed
  from public.tag_commitments
  where tag_batch_id = v_batch_id and status in ('committed', 'refund_pending');

  update public.tag_batches
  set target_reached_at = case
        when target_reached_at is null and v_committed >= target_quantity then statement_timestamp()
        else target_reached_at
      end,
      updated_at = statement_timestamp()
  where id = v_batch_id;

  return jsonb_build_object('order_id', p_order_id, 'tag', true, 'batch_id', v_batch_id, 'committed_quantity', v_committed);
end;
$$;

create or replace function public.release_tag_commitments_for_order(p_order_id integer, p_reason text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.tag_commitments
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, statement_timestamp()), updated_at = statement_timestamp()
  where order_id = p_order_id and status in ('reserved', 'awaiting_verification');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.close_tag_batch(p_batch_id uuid, p_administrator_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.tag_batches%rowtype;
  v_successor public.tag_batches%rowtype;
  v_committed numeric;
  v_row public.tag_commitments%rowtype;
  v_new_id uuid;
begin
  select * into v_batch from public.tag_batches where id = p_batch_id for update;
  if not found then raise exception 'Tag batch not found'; end if;
  if v_batch.status not in ('open', 'closed') then raise exception 'Tag batch cannot be closed from status %', v_batch.status; end if;

  update public.tag_commitments
  set status = 'expired', cancelled_at = coalesce(cancelled_at, statement_timestamp()), updated_at = statement_timestamp()
  where tag_batch_id = p_batch_id and status in ('reserved', 'awaiting_verification');

  select coalesce(sum(quantity), 0) into v_committed
  from public.tag_commitments where tag_batch_id = p_batch_id and status = 'committed';

  if v_committed >= v_batch.minimum_viable_quantity then
    update public.tag_batches
    set status = 'procurement', closed_at = coalesce(closed_at, statement_timestamp()),
        updated_by = p_administrator_id, updated_at = statement_timestamp()
    where id = p_batch_id;
    return jsonb_build_object('batch_id', p_batch_id, 'status', 'procurement', 'committed_quantity', v_committed);
  end if;

  if v_batch.failure_policy = 'carry_forward' then
    if v_batch.carry_forward_batch_id is null then raise exception 'Carry-forward batch is required'; end if;
    select * into v_successor from public.tag_batches where id = v_batch.carry_forward_batch_id for update;
    if not found or v_successor.status not in ('draft', 'open') or v_successor.variant_id <> v_batch.variant_id then
      raise exception 'Carry-forward batch must be a compatible draft or open batch';
    end if;
    if v_committed > v_successor.maximum_quantity then raise exception 'Carry-forward batch does not have enough capacity'; end if;

    for v_row in select * from public.tag_commitments where tag_batch_id = p_batch_id and status = 'committed' for update
    loop
      insert into public.tag_commitments (
        tag_batch_id, user_id, order_id, order_item_id, reservation_key, status,
        quantity, tag_price_snapshot, currency_code, committed_at
      ) values (
        v_successor.id, v_row.user_id, v_row.order_id, v_row.order_item_id,
        'carry-forward:' || v_row.id::text, 'committed', v_row.quantity,
        v_row.tag_price_snapshot, v_row.currency_code, coalesce(v_row.committed_at, statement_timestamp())
      ) returning id into v_new_id;
      update public.tag_commitments
      set status = 'carry_forwarded', carried_forward_to_commitment_id = v_new_id, updated_at = statement_timestamp()
      where id = v_row.id;
    end loop;
  else
    update public.tag_commitments
    set status = 'refund_pending', updated_at = statement_timestamp()
    where tag_batch_id = p_batch_id and status = 'committed';
    update public.orders o
    set status = 'cancelled', cancellation_reason = 'Tag Buy minimum was not reached',
        cancelled_at = coalesce(cancelled_at, statement_timestamp()), updated_at = statement_timestamp()
    where exists (
      select 1 from public.tag_commitments c
      where c.order_id = o.id and c.tag_batch_id = p_batch_id and c.status = 'refund_pending'
    ) and o.status <> 'cancelled';
  end if;

  update public.tag_batches
  set status = 'failed', closed_at = coalesce(closed_at, statement_timestamp()),
      updated_by = p_administrator_id, updated_at = statement_timestamp()
  where id = p_batch_id;
  return jsonb_build_object('batch_id', p_batch_id, 'status', 'failed', 'committed_quantity', v_committed, 'failure_policy', v_batch.failure_policy);
end;
$$;

create or replace function public.enforce_tag_order_item_consistency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mode text;
begin
  select procurement_mode into v_mode from public.orders where id = new.order_id;
  if v_mode is null or v_mode <> new.procurement_mode then
    raise exception 'Order item procurement mode must match its order';
  end if;
  return new;
end;
$$;

create trigger order_items_tag_consistency
before insert or update of order_id, procurement_mode, tag_batch_id on public.order_items
for each row execute function public.enforce_tag_order_item_consistency();

create or replace function public.release_tag_commitment_on_order_failure()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.procurement_mode = 'tag'
     and (
       (new.status in ('cancelled', 'payment_failed') and old.status is distinct from new.status)
       or (new.payment_status in ('failed', 'rejected', 'refunded') and old.payment_status is distinct from new.payment_status)
     ) then
    perform public.release_tag_commitments_for_order(new.id, 'order payment or fulfilment failed');
  end if;
  return new;
end;
$$;

create trigger orders_release_tag_commitment_on_failure
after update of status, payment_status on public.orders
for each row execute function public.release_tag_commitment_on_order_failure();

-- Divert Tag orders away from shelf-stock deduction. All existing payment
-- finalisers call this shared function, so confirmation remains provider-agnostic.
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

  if v_order.procurement_mode = 'tag' then
    perform public.confirm_tag_commitments_for_order(p_order_id);
    return;
  end if;

  select count(distinct oi.variant_id)::integer into v_item_count
  from public.order_items oi
  join public.product_variants pv on pv.id = oi.variant_id
  where oi.order_id = p_order_id and pv.inventory_tracking_mode = 'tracked';

  if not exists (select 1 from public.order_items where order_id = p_order_id) then raise exception 'Order has no items'; end if;
  if exists (select 1 from public.order_items where order_id = p_order_id and (variant_id is null or quantity is null or quantity <= 0)) then
    raise exception 'Order contains an invalid item';
  end if;

  select count(distinct variant_id)::integer into v_existing_count
  from public.stock_ledger where reason = 'order_deduction' and source = v_source;
  if coalesce(v_existing_count, 0) = coalesce(v_item_count, 0) then return; end if;
  if coalesce(v_existing_count, 0) > 0 then raise exception 'Partial stock deduction detected for order %', p_order_id; end if;

  for v_item in
    select oi.variant_id, sum(oi.quantity)::numeric as quantity
    from public.order_items oi join public.product_variants pv on pv.id = oi.variant_id
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
    from public.order_items oi join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id and pv.inventory_tracking_mode = 'tracked'
    group by oi.variant_id order by oi.variant_id
  loop
    update public.product_variants set stock_count = stock_count - v_item.quantity, updated_at = now() where id = v_item.variant_id;
    insert into public.stock_ledger(variant_id, change_qty, reason, source, note)
    values (v_item.variant_id, -v_item.quantity, 'order_deduction', v_source, 'Confirmed payment for Meal05 order ' || p_order_id::text);
  end loop;
end;
$$;

revoke all on function public.expire_tag_reservations(uuid) from public, anon, authenticated;
revoke all on function public.reserve_tag_capacity(uuid, uuid, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.bind_tag_commitment_to_order(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.confirm_tag_commitments_for_order(integer) from public, anon, authenticated;
revoke all on function public.release_tag_commitments_for_order(integer, text) from public, anon, authenticated;
revoke all on function public.close_tag_batch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enforce_tag_order_item_consistency() from public, anon, authenticated;
revoke all on function public.release_tag_commitment_on_order_failure() from public, anon, authenticated;
revoke all on function public.deduct_stock_for_order(integer) from public, anon, authenticated;

grant execute on function public.expire_tag_reservations(uuid) to service_role;
grant execute on function public.reserve_tag_capacity(uuid, uuid, numeric, text, integer) to service_role;
grant execute on function public.bind_tag_commitment_to_order(uuid, uuid, text, integer) to service_role;
grant execute on function public.confirm_tag_commitments_for_order(integer) to service_role;
grant execute on function public.release_tag_commitments_for_order(integer, text) to service_role;
grant execute on function public.close_tag_batch(uuid, uuid) to service_role;
grant execute on function public.deduct_stock_for_order(integer) to service_role;

notify pgrst, 'reload schema';
