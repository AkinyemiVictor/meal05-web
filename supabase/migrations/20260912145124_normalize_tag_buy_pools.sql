-- Normalize Tag Buy progress across compatible product options.
-- A batch now represents one procurement pool (for example 50 kg), while
-- tag_batch_variants maps each shopper-facing option into that base unit.

alter table public.tag_batches
  add column contribution_unit text;

update public.tag_batches b
set contribution_unit = lower(btrim(coalesce(nullif(v.base_unit, ''), nullif(v.unit, ''), 'unit'))),
    minimum_viable_quantity = b.minimum_viable_quantity * coalesce(v.base_quantity, 1),
    target_quantity = b.target_quantity * coalesce(v.base_quantity, 1),
    maximum_quantity = b.maximum_quantity * coalesce(v.base_quantity, 1)
from public.product_variants v
where v.id = b.variant_id;

alter table public.tag_batches
  alter column contribution_unit set not null,
  add constraint tag_batches_contribution_unit_check
    check (char_length(btrim(contribution_unit)) between 1 and 30);

create table public.tag_batch_variants (
  tag_batch_id uuid not null references public.tag_batches(id) on delete cascade,
  variant_id bigint not null references public.product_variants(id) on delete restrict,
  contribution_quantity numeric(12,3) not null check (contribution_quantity > 0),
  tag_price numeric(12,2) not null check (tag_price >= 0),
  standard_price_at_open numeric(12,2) not null check (standard_price_at_open >= 0),
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tag_batch_id, variant_id),
  constraint tag_batch_variants_discount_check check (tag_price < standard_price_at_open)
);

comment on table public.tag_batch_variants is
  'Shopper options participating in one normalized Tag Buy procurement pool.';
comment on column public.tag_batch_variants.contribution_quantity is
  'Amount of the parent batch contribution_unit supplied by one unit of this option.';
comment on column public.tag_batch_variants.is_live is
  'Denormalized parent-open flag used to prevent an option joining overlapping live pools.';

insert into public.tag_batch_variants (
  tag_batch_id, variant_id, contribution_quantity, tag_price,
  standard_price_at_open, is_live
)
select
  b.id,
  b.variant_id,
  coalesce(v.base_quantity, 1),
  b.tag_price,
  b.standard_price_at_open,
  b.status = 'open'
from public.tag_batches b
join public.product_variants v on v.id = b.variant_id;

-- Existing V1 commitments and targets were expressed in option counts. Convert
-- the commitments after the batch targets have been converted above.
update public.tag_commitments c
set quantity = c.quantity * m.contribution_quantity,
    updated_at = statement_timestamp()
from public.tag_batch_variants m
where m.tag_batch_id = c.tag_batch_id;

drop index if exists public.tag_batches_one_live_variant_idx;
create unique index tag_batch_variants_one_live_option_idx
  on public.tag_batch_variants (variant_id)
  where is_live;
create index tag_batch_variants_batch_idx
  on public.tag_batch_variants (tag_batch_id, variant_id);

alter table public.tag_batch_variants enable row level security;
revoke all on table public.tag_batch_variants from public, anon, authenticated;
grant select, insert, update, delete on table public.tag_batch_variants to service_role;

create or replace function public.enforce_tag_batch_variant_member()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.tag_batches%rowtype;
  v_variant public.product_variants%rowtype;
begin
  select * into v_batch
  from public.tag_batches
  where id = new.tag_batch_id;
  if not found then raise exception 'Tag Buy not found'; end if;

  select * into v_variant
  from public.product_variants
  where id = new.variant_id;
  if not found or v_variant.is_active is not true then
    raise exception 'Tag Buy requires an active product option';
  end if;
  if v_variant.product_id <> v_batch.product_id or v_variant.market_id <> v_batch.market_id then
    raise exception 'Tag Buy member must belong to the same product and market';
  end if;
  if v_variant.tag_buy_eligible is not true then
    raise exception 'This product option is not eligible for Tag Buy';
  end if;
  if lower(btrim(coalesce(v_variant.base_unit, ''))) <> lower(btrim(v_batch.contribution_unit))
     or v_variant.base_quantity is null then
    raise exception 'Tag Buy options must use the pool contribution unit';
  end if;
  if v_variant.tag_buy_purchase_mode <> v_batch.purchase_mode then
    raise exception 'Tag Buy options must use the same shopper purchase mode';
  end if;

  new.contribution_quantity := v_variant.base_quantity;
  new.standard_price_at_open := v_variant.price;
  new.is_live := v_batch.status = 'open';
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger tag_batch_variants_member_integrity
before insert or update of tag_batch_id, variant_id, contribution_quantity,
  tag_price, standard_price_at_open
on public.tag_batch_variants
for each row execute function public.enforce_tag_batch_variant_member();

create or replace function public.sync_tag_batch_member_live_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    update public.tag_batch_variants
    set is_live = new.status = 'open', updated_at = statement_timestamp()
    where tag_batch_id = new.id;
  end if;
  return new;
end;
$$;

create trigger tag_batches_sync_member_live_state
after update of status on public.tag_batches
for each row execute function public.sync_tag_batch_member_live_state();

-- The original view expanded b.* before purchase_mode and contribution_unit
-- existed. Recreate it so PostgreSQL does not interpret the appended table
-- columns as renames of the existing aggregate columns.
drop view if exists public.tag_batch_progress;
create view public.tag_batch_progress
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

comment on column public.tag_commitments.quantity is
  'Reserved or paid quantity normalized into the parent batch contribution_unit.';

create or replace function public.create_tag_batch_pool(
  p_anchor_variant_id bigint,
  p_tag_unit_price numeric,
  p_minimum_viable_quantity numeric,
  p_target_quantity numeric,
  p_maximum_quantity numeric,
  p_closes_at timestamptz,
  p_expected_procurement_at timestamptz,
  p_failure_policy text,
  p_carry_forward_batch_id uuid,
  p_status text,
  p_administrator_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anchor public.product_variants%rowtype;
  v_batch_id uuid;
  v_member_count integer;
  v_contribution_unit text;
begin
  select * into v_anchor
  from public.product_variants
  where id = p_anchor_variant_id
  for update;
  if not found or v_anchor.is_active is not true or v_anchor.tag_buy_eligible is not true then
    raise exception 'Active Tag Buy option not found';
  end if;
  if v_anchor.base_quantity is null or nullif(btrim(v_anchor.base_unit), '') is null then
    raise exception 'Tag Buy option requires a canonical base quantity and unit';
  end if;
  if p_tag_unit_price is null or p_tag_unit_price < 0 then raise exception 'Tag unit price is invalid'; end if;
  if p_minimum_viable_quantity is null or p_target_quantity is null or p_maximum_quantity is null
     or p_minimum_viable_quantity <= 0 or p_minimum_viable_quantity > p_target_quantity
     or p_target_quantity > p_maximum_quantity then
    raise exception 'Quantities must satisfy minimum viable <= target <= maximum';
  end if;
  if p_closes_at is null or p_closes_at <= statement_timestamp() then raise exception 'Tag Buy must close in the future'; end if;
  if p_expected_procurement_at is null or p_expected_procurement_at <= p_closes_at then raise exception 'Expected procurement must be after close'; end if;
  if p_failure_policy is null or p_failure_policy not in ('refund', 'carry_forward') then raise exception 'Invalid failure policy'; end if;
  if p_status is null or p_status not in ('draft', 'open') then raise exception 'Invalid initial status'; end if;
  if p_failure_policy = 'carry_forward' and p_carry_forward_batch_id is null then
    raise exception 'Carry-forward batch is required';
  end if;

  v_contribution_unit := lower(btrim(v_anchor.base_unit));

  if p_failure_policy = 'carry_forward' and not exists (
    select 1
    from public.tag_batches successor
    where successor.id = p_carry_forward_batch_id
      and successor.product_id = v_anchor.product_id
      and successor.market_id = v_anchor.market_id
      and successor.status in ('draft', 'open')
      and lower(btrim(successor.contribution_unit)) = v_contribution_unit
  ) then
    raise exception 'Carry-forward batch must be a compatible draft or open product pool';
  end if;

  if exists (
    select 1
    from public.product_variants v
    where v.product_id = v_anchor.product_id
      and v.market_id = v_anchor.market_id
      and v.is_active
      and v.tag_buy_eligible
      and v.tag_buy_purchase_mode = v_anchor.tag_buy_purchase_mode
      and lower(btrim(coalesce(v.base_unit, ''))) = v_contribution_unit
      and v.base_quantity is not null
      and round(p_tag_unit_price * v.base_quantity, 2) >= v.price
  ) then
    raise exception 'Tag unit price must discount every included product option';
  end if;

  insert into public.tag_batches (
    market_id, product_id, variant_id, status, tag_price,
    standard_price_at_open, target_quantity, minimum_viable_quantity,
    maximum_quantity, contribution_unit, closes_at,
    expected_procurement_at, failure_policy, purchase_mode,
    carry_forward_batch_id, created_by, updated_by
  ) values (
    v_anchor.market_id, v_anchor.product_id, v_anchor.id, 'draft',
    round(p_tag_unit_price * v_anchor.base_quantity, 2), v_anchor.price,
    p_target_quantity, p_minimum_viable_quantity, p_maximum_quantity,
    v_contribution_unit, p_closes_at, p_expected_procurement_at,
    p_failure_policy, v_anchor.tag_buy_purchase_mode,
    case when p_failure_policy = 'carry_forward' then p_carry_forward_batch_id else null end,
    p_administrator_id, p_administrator_id
  ) returning id into v_batch_id;

  insert into public.tag_batch_variants (
    tag_batch_id, variant_id, contribution_quantity, tag_price,
    standard_price_at_open
  )
  select
    v_batch_id, v.id, v.base_quantity,
    round(p_tag_unit_price * v.base_quantity, 2), v.price
  from public.product_variants v
  where v.product_id = v_anchor.product_id
    and v.market_id = v_anchor.market_id
    and v.is_active
    and v.tag_buy_eligible
    and v.tag_buy_purchase_mode = v_anchor.tag_buy_purchase_mode
    and lower(btrim(coalesce(v.base_unit, ''))) = v_contribution_unit
    and v.base_quantity is not null;
  get diagnostics v_member_count = row_count;
  if v_member_count = 0 then raise exception 'Tag Buy has no compatible product options'; end if;

  if p_status = 'open' then
    update public.tag_batches set status = 'open' where id = v_batch_id;
  end if;
  return v_batch_id;
end;
$$;

create or replace function public.reserve_tag_capacity_v2(
  p_batch_id uuid,
  p_user_id uuid,
  p_lines jsonb,
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
  v_commitment public.tag_commitments%rowtype;
  v_requested numeric;
  v_total_price numeric;
  v_used numeric;
  v_now timestamptz := statement_timestamp();
begin
  if p_batch_id is null or p_user_id is null then raise exception 'Tag batch and user are required'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Tag cart lines are required'; end if;
  if char_length(btrim(coalesce(p_reservation_key, ''))) not between 8 and 200 then raise exception 'Tag reservation key is invalid'; end if;
  if p_hold_minutes is null or p_hold_minutes not between 5 and 1440 then raise exception 'Tag hold window must be between 5 and 1440 minutes'; end if;

  select * into v_batch from public.tag_batches where id = p_batch_id for update;
  if not found then raise exception 'Tag batch not found'; end if;
  perform public.expire_tag_reservations(p_batch_id);

  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    left join public.tag_batch_variants m
      on m.tag_batch_id = p_batch_id and m.variant_id = (line->>'variant_id')::bigint
    left join public.product_variants v on v.id = m.variant_id
    cross join lateral (select (line->>'quantity')::numeric as quantity) q
    where m.variant_id is null
      or q.quantity <= 0
      or q.quantity < coalesce(v.min_quantity, 1)
      or (v.max_quantity is not null and q.quantity > v.max_quantity)
      or mod(q.quantity - coalesce(v.min_quantity, 1), coalesce(nullif(v.step_quantity, 0), 1)) <> 0
      or (coalesce(v.purchase_mode, 'fixed') = 'fixed' and trunc(q.quantity) <> q.quantity)
  ) then
    raise exception 'Tag cart contains an invalid option or quantity';
  end if;

  select
    sum((line->>'quantity')::numeric * m.contribution_quantity),
    sum((line->>'quantity')::numeric * m.tag_price)
  into v_requested, v_total_price
  from jsonb_array_elements(p_lines) line
  join public.tag_batch_variants m
    on m.tag_batch_id = p_batch_id and m.variant_id = (line->>'variant_id')::bigint;
  if v_requested is null or v_requested <= 0 then raise exception 'Tag quantity must be positive'; end if;

  select * into v_existing
  from public.tag_commitments
  where tag_batch_id = p_batch_id and user_id = p_user_id and reservation_key = btrim(p_reservation_key)
  for update;
  if found then
    if v_existing.quantity is distinct from v_requested then raise exception 'Tag reservation was reused with a different quantity'; end if;
    return to_jsonb(v_existing) || jsonb_build_object('already_processed', true, 'contribution_quantity', v_requested);
  end if;

  if v_batch.status <> 'open' or v_batch.closes_at <= v_now then raise exception 'This Tag Buy is closed'; end if;
  select coalesce(sum(quantity), 0) into v_used
  from public.tag_commitments
  where tag_batch_id = p_batch_id
    and status in ('reserved', 'awaiting_verification', 'committed', 'refund_pending');
  if v_used + v_requested > v_batch.maximum_quantity then
    raise exception 'Only % % remains in this Tag Buy', greatest(v_batch.maximum_quantity - v_used, 0), v_batch.contribution_unit;
  end if;

  insert into public.tag_commitments (
    tag_batch_id, user_id, reservation_key, status, quantity,
    tag_price_snapshot, currency_code, reservation_expires_at
  )
  select v_batch.id, p_user_id, btrim(p_reservation_key), 'reserved', v_requested,
    round(v_total_price / v_requested, 2), m.currency_code,
    v_now + make_interval(mins => p_hold_minutes)
  from public.markets m where m.id = v_batch.market_id
  returning * into v_commitment;

  return to_jsonb(v_commitment) || jsonb_build_object('already_processed', false, 'contribution_quantity', v_requested);
end;
$$;

create or replace function public.bind_tag_commitment_to_order_v2(
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
  v_item_count integer;
  v_valid_count integer;
  v_contribution numeric;
begin
  select * into v_commitment from public.tag_commitments
  where tag_batch_id = p_batch_id and user_id = p_user_id and reservation_key = btrim(p_reservation_key)
  for update;
  if not found or v_commitment.status <> 'reserved' then raise exception 'Active Tag reservation not found'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id or v_order.procurement_mode <> 'tag' then
    raise exception 'Tag order does not match reservation';
  end if;

  select
    count(*),
    count(m.variant_id) filter (
      where oi.tag_batch_id = p_batch_id
        and oi.procurement_mode = 'tag'
        and oi.price = m.tag_price
    ),
    sum(oi.quantity * m.contribution_quantity)
  into v_item_count, v_valid_count, v_contribution
  from public.order_items oi
  left join public.tag_batch_variants m
    on m.tag_batch_id = p_batch_id and m.variant_id = oi.variant_id
  where oi.order_id = p_order_id;

  if v_item_count = 0 or v_valid_count <> v_item_count
     or v_contribution is distinct from v_commitment.quantity then
    raise exception 'Tag order items do not match reservation';
  end if;

  update public.tag_commitments
  set order_id = p_order_id, order_item_id = null,
      status = 'awaiting_verification', reservation_expires_at = null,
      updated_at = statement_timestamp()
  where id = v_commitment.id
  returning * into v_commitment;
  return to_jsonb(v_commitment);
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
  v_payment_status text;
begin
  select payment_status into v_payment_status from public.orders where id = p_order_id;
  update public.tag_commitments
  set status = case
        when status = 'refund_pending' and v_payment_status = 'refunded' then 'refunded'
        when status = 'refund_pending' then status
        else 'cancelled'
      end,
      cancelled_at = case when status <> 'refund_pending' then coalesce(cancelled_at, statement_timestamp()) else cancelled_at end,
      refunded_at = case when status = 'refund_pending' and v_payment_status = 'refunded' then coalesce(refunded_at, statement_timestamp()) else refunded_at end,
      updated_at = statement_timestamp()
  where order_id = p_order_id
    and status in ('reserved', 'awaiting_verification', 'committed', 'refund_pending')
    and (status <> 'refund_pending' or v_payment_status = 'refunded');
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
  v_successor_used numeric;
  v_row public.tag_commitments%rowtype;
  v_new_id uuid;
begin
  select * into v_batch from public.tag_batches where id = p_batch_id for update;
  if not found then raise exception 'Tag batch not found'; end if;
  if v_batch.status not in ('open', 'closed') then raise exception 'Tag batch cannot be closed from status %', v_batch.status; end if;

  update public.tag_commitments
  set status = 'expired', cancelled_at = coalesce(cancelled_at, statement_timestamp()), updated_at = statement_timestamp()
  where tag_batch_id = p_batch_id and status = 'reserved';

  -- A submitted manual payment must be accepted or rejected before the pool
  -- closes. Retrying the scheduled close is safer than orphaning money that is
  -- still under review or counting an unverified transfer toward procurement.
  if exists (
    select 1 from public.tag_commitments
    where tag_batch_id = p_batch_id and status = 'awaiting_verification'
  ) then
    raise exception 'Tag Buy has payments awaiting verification';
  end if;

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
    if not found or v_successor.status not in ('draft', 'open')
       or v_successor.product_id <> v_batch.product_id
       or v_successor.market_id <> v_batch.market_id
       or lower(btrim(v_successor.contribution_unit)) <> lower(btrim(v_batch.contribution_unit)) then
      raise exception 'Carry-forward batch must be a compatible draft or open product pool';
    end if;

    select coalesce(sum(quantity), 0) into v_successor_used
    from public.tag_commitments
    where tag_batch_id = v_successor.id
      and status in ('reserved', 'awaiting_verification', 'committed', 'refund_pending');
    if v_successor_used + v_committed > v_successor.maximum_quantity then
      raise exception 'Carry-forward batch does not have enough capacity';
    end if;
    if exists (
      select 1
      from public.tag_commitments c
      join public.order_items oi on oi.order_id = c.order_id
      where c.tag_batch_id = p_batch_id and c.status = 'committed'
        and not exists (
          select 1 from public.tag_batch_variants m
          where m.tag_batch_id = v_successor.id and m.variant_id = oi.variant_id
        )
    ) then
      raise exception 'Carry-forward batch does not support every committed option';
    end if;

    for v_row in
      select * from public.tag_commitments
      where tag_batch_id = p_batch_id and status = 'committed'
      for update
    loop
      insert into public.tag_commitments (
        tag_batch_id, user_id, order_id, order_item_id, reservation_key, status,
        quantity, tag_price_snapshot, currency_code, committed_at
      ) values (
        v_successor.id, v_row.user_id, v_row.order_id, null,
        'carry-forward:' || v_row.id::text, 'committed', v_row.quantity,
        v_row.tag_price_snapshot, v_row.currency_code,
        coalesce(v_row.committed_at, statement_timestamp())
      ) returning id into v_new_id;

      update public.order_items
      set tag_batch_id = v_successor.id,
          tag_closes_at_snapshot = v_successor.closes_at,
          expected_procurement_at_snapshot = v_successor.expected_procurement_at
      where order_id = v_row.order_id and tag_batch_id = p_batch_id;

      update public.tag_commitments
      set status = 'carry_forwarded', carried_forward_to_commitment_id = v_new_id,
          updated_at = statement_timestamp()
      where id = v_row.id;
    end loop;

    update public.tag_batches
    set target_reached_at = case
          when target_reached_at is null and v_successor_used + v_committed >= target_quantity
            then statement_timestamp()
          else target_reached_at
        end,
        updated_at = statement_timestamp()
    where id = v_successor.id;
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
  return jsonb_build_object(
    'batch_id', p_batch_id,
    'status', 'failed',
    'committed_quantity', v_committed,
    'failure_policy', v_batch.failure_policy,
    'carry_forward_batch_id', v_batch.carry_forward_batch_id
  );
end;
$$;

create or replace function public.close_due_tag_batches()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch record;
  v_processed integer := 0;
  v_failed integer := 0;
begin
  for v_batch in
    select id
    from public.tag_batches
    where status = 'open' and closes_at <= statement_timestamp()
    order by closes_at, id
  loop
    begin
      perform public.close_tag_batch(v_batch.id, null);
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Unable to close due Tag Buy %: %', v_batch.id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('processed', v_processed, 'failed', v_failed);
end;
$$;

revoke all on function public.create_tag_batch_pool(bigint,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.reserve_tag_capacity_v2(uuid,uuid,jsonb,text,integer) from public, anon, authenticated;
revoke all on function public.bind_tag_commitment_to_order_v2(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.enforce_tag_batch_variant_member() from public, anon, authenticated;
revoke all on function public.sync_tag_batch_member_live_state() from public, anon, authenticated;
revoke all on function public.close_due_tag_batches() from public, anon, authenticated;

grant execute on function public.create_tag_batch_pool(bigint,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,uuid,text,uuid) to service_role;
grant execute on function public.reserve_tag_capacity_v2(uuid,uuid,jsonb,text,integer) to service_role;
grant execute on function public.bind_tag_commitment_to_order_v2(uuid,uuid,text,integer) to service_role;
grant execute on function public.close_tag_batch(uuid,uuid) to service_role;
grant execute on function public.close_due_tag_batches() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'close_due_meal05_tag_buys';

select cron.schedule(
  'close_due_meal05_tag_buys',
  '*/5 * * * *',
  'select public.close_due_tag_batches();'
);

notify pgrst, 'reload schema';
