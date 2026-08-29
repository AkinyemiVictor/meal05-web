-- Finalize a verified Paystack payment exactly once. The order row lock makes
-- concurrent callback/webhook retries serialize, and every write below is in
-- the same database transaction.

create unique index if not exists orders_payment_reference_key
  on public.orders (payment_reference)
  where payment_reference is not null;
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
  v_item record;
  v_stock numeric;
  v_variant_market uuid;
  v_reference text := btrim(coalesce(p_transaction_ref, ''));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_item_count integer;
begin
  if v_reference = '' then
    raise exception 'Payment reference is required';
  end if;
  if v_currency = '' then
    raise exception 'Payment currency is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if p_amount is null or p_amount <> v_order.total then
    raise exception 'Payment amount does not match order total';
  end if;
  if v_currency <> upper(v_order.currency_code) then
    raise exception 'Payment currency does not match order currency';
  end if;

  select order_id into v_existing_payment_order
  from public.payments
  where transaction_ref = v_reference;

  if v_existing_payment_order is not null and v_existing_payment_order <> p_order_id then
    raise exception 'Payment reference is already assigned to another order';
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
    select variant_id, sum(quantity)::integer as quantity
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
revoke all on function public.mark_paystack_order_paid(integer, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_paystack_order_paid(integer, text, numeric, text) to service_role;
-- This legacy function references the retired inventory_movements table and
-- must not remain callable from public API roles.
revoke all on function public.deduct_stock_for_order(uuid) from public, anon, authenticated;
