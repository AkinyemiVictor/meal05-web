alter table public.product_variants
  add column if not exists purchase_mode text not null default 'fixed',
  add column if not exists min_quantity numeric,
  add column if not exists max_quantity numeric,
  add column if not exists step_quantity numeric;

alter table public.product_variants
  drop constraint if exists product_variants_purchase_mode_check,
  add constraint product_variants_purchase_mode_check
    check (purchase_mode in ('fixed', 'loose'));

alter table public.product_variants
  drop constraint if exists product_variants_loose_quantity_bounds_check,
  add constraint product_variants_loose_quantity_bounds_check
    check (
      (min_quantity is null or min_quantity > 0)
      and (max_quantity is null or max_quantity > 0)
      and (step_quantity is null or step_quantity > 0)
      and (min_quantity is null or max_quantity is null or min_quantity <= max_quantity)
    );

comment on column public.product_variants.purchase_mode is
  'fixed variants are sold as preset options; loose variants accept a customer-entered scalable quantity.';
comment on column public.product_variants.min_quantity is
  'Minimum customer-entered quantity for loose purchase mode.';
comment on column public.product_variants.max_quantity is
  'Maximum customer-entered quantity for loose purchase mode.';
comment on column public.product_variants.step_quantity is
  'Allowed quantity increment for loose purchase mode, e.g. 0.5 for half-kg steps.';

drop view if exists public.vw_sales_summary;
drop view if exists public.products_cards_view_v2;
drop view if exists public.vw_catalog_overview;
drop view if exists public.vw_low_stock;
drop view if exists public.restock_log_v2;

alter table public.cart_items
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

alter table public.order_items
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

alter table public.product_variants
  alter column stock_count type numeric(12,3) using stock_count::numeric(12,3);

alter table public.stock_ledger
  alter column change_qty type numeric(12,3) using change_qty::numeric(12,3);

alter table public.orders
  add column if not exists handling_fee integer not null default 0;

comment on column public.orders.handling_fee is
  'Visible low-order handling fee charged when subtotal is below the global minimum order threshold.';

create or replace view public.vw_catalog_overview
with (security_invoker = on) as
select
  p.id as product_id,
  p.name as product,
  c.name as category,
  p.is_active,
  p.in_season,
  count(v.id) as variant_count,
  count(v.id) filter (where v.is_active) as active_variants,
  min(v.price) filter (where v.is_active) as from_price,
  max(v.price) filter (where v.is_active) as to_price,
  coalesce(sum(v.stock_count) filter (where v.is_active), 0::numeric) as total_stock,
  p.created_at
from public.products p
left join public.product_categories c on c.id = p.category_id
left join public.product_variants v on v.product_id = p.id
group by p.id, p.name, c.name, p.is_active, p.in_season, p.created_at
order by c.name, p.name;

comment on view public.vw_catalog_overview is
  'Business view: one row per product with category, active-variant count, price range, and total stock. Read-only summary for staff.';
grant all on table public.vw_catalog_overview to anon;
grant all on table public.vw_catalog_overview to authenticated;
grant all on table public.vw_catalog_overview to service_role;

create or replace view public.vw_low_stock
with (security_invoker = on) as
select
  v.id as variant_id,
  p.name as product,
  v.name as variant,
  v.unit,
  v.stock_count,
  v.price,
  c.name as category
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.product_categories c on c.id = p.category_id
where v.is_active and v.stock_count <= 5
order by v.stock_count, p.name;

comment on view public.vw_low_stock is
  'Business view: active variants at or below 5 units in stock - a restock worklist. Threshold can be adjusted.';
grant all on table public.vw_low_stock to anon;
grant all on table public.vw_low_stock to authenticated;
grant all on table public.vw_low_stock to service_role;

create or replace view public.products_cards_view_v2
with (security_invoker = on) as
select
  p.id,
  p.name,
  p.main_image_url,
  p.category_id,
  p.is_active,
  p.in_season,
  min(v.price) filter (where v.is_active = true) as starting_price,
  bool_or((v.stock_count > 0) and (v.is_active = true)) as in_stock
from public.products p
left join public.product_variants v on v.product_id = p.id
group by p.id;

grant all on table public.products_cards_view_v2 to anon;
grant all on table public.products_cards_view_v2 to authenticated;
grant all on table public.products_cards_view_v2 to service_role;

create or replace view public.restock_log_v2
with (security_invoker = on) as
select
  id,
  variant_id,
  change_qty as quantity,
  source as restocked_by,
  created_at as restocked_at
from public.stock_ledger
where reason = 'restock';

grant all on table public.restock_log_v2 to anon;
grant all on table public.restock_log_v2 to authenticated;
grant all on table public.restock_log_v2 to service_role;

create or replace view public.vw_sales_summary
with (security_invoker = on) as
select
  date(o.created_at) as order_date,
  count(distinct o.id) as total_orders,
  sum(oi.quantity) as total_items_sold,
  sum(oi.price * oi.quantity) as total_revenue
from public.orders o
join public.order_items oi on o.id = oi.order_id
where o.status <> 'cancelled'
group by date(o.created_at)
order by date(o.created_at) desc;

grant all on table public.vw_sales_summary to anon;
grant all on table public.vw_sales_summary to authenticated;
grant all on table public.vw_sales_summary to service_role;

create or replace function public.verify_paystack_payment(
  p_order_id bigint,
  p_reference text,
  p_amount numeric,
  p_currency text default 'NGN'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_existing_payment_order bigint;
  v_reference text := trim(coalesce(p_reference, ''));
  v_currency text := upper(trim(coalesce(p_currency, 'NGN')));
  v_item_count integer;
  v_item record;
  v_stock numeric;
  v_variant_market uuid;
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;
  if v_reference = '' then
    raise exception 'Payment reference is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;
  if upper(coalesce(v_order.currency_code, 'NGN')) <> v_currency then
    raise exception 'Currency mismatch for order %', p_order_id;
  end if;
  if abs(coalesce(v_order.total, 0) - p_amount) > 1 then
    raise exception 'Payment amount % does not match order total %', p_amount, v_order.total;
  end if;

  select order_id
    into v_existing_payment_order
  from public.payments
  where transaction_ref = v_reference
  limit 1;

  if v_existing_payment_order is not null and v_existing_payment_order <> p_order_id then
    raise exception 'Payment reference already belongs to another order';
  end if;

  if lower(coalesce(v_order.payment_status, '')) = 'paid' then
    if v_order.payment_reference = v_reference or v_existing_payment_order = p_order_id then
      return jsonb_build_object(
        'order_id', p_order_id,
        'transaction_ref', v_reference,
        'already_processed', true,
        'stock_updated', false
      );
    end if;
    raise exception 'Order is already paid with a different payment reference';
  end if;

  select count(*) into v_item_count
  from public.order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'Order % has no items', p_order_id;
  end if;
  if exists (
    select 1 from public.order_items
    where order_id = p_order_id and (variant_id is null or quantity is null or quantity <= 0)
  ) then
    raise exception 'Order % contains an invalid item', p_order_id;
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
      'Paystack payment ' || v_reference
    );
  end loop;

  insert into public.payments (
    order_id, amount, method, status, transaction_ref, paid_at, currency_code
  ) values (
    p_order_id, p_amount, 'paystack', 'success', v_reference, now(), v_currency
  )
  on conflict (transaction_ref) do update
    set status = 'success',
        paid_at = excluded.paid_at;

  update public.orders
  set payment_status = 'paid',
      payment_method = 'paystack',
      payment_reference = v_reference,
      payment_verified = true,
      status = 'processing',
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'transaction_ref', v_reference,
    'already_processed', false,
    'stock_updated', true
  );
end;
$$;
