-- Atomically convert a confirmed availability request into one payable order.
-- The request row is locked for the duration of the conversion so concurrent
-- retries cannot create duplicate or partially-created orders.

create or replace function public.convert_availability_request_to_order(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.availability_requests%rowtype;
  v_order public.orders%rowtype;
  v_existing_order public.orders%rowtype;
  v_now timestamptz := now();
  v_active_count integer := 0;
  v_invalid_count integer := 0;
  v_total numeric(12,2) := 0;
begin
  if p_request_id is null or p_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_INPUT',
      'error', 'Request and user are required.'
    );
  end if;

  select *
  into v_request
  from public.availability_requests
  where id = p_request_id
    and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'REQUEST_NOT_FOUND',
      'error', 'Availability request not found.'
    );
  end if;

  -- Heal a legacy/partial state if an order already exists for this request.
  -- The unique index on orders(availability_request_id) remains a second guard.
  select *
  into v_existing_order
  from public.orders
  where availability_request_id = p_request_id
  limit 1;

  if found then
    if v_request.status <> 'converted'
       or v_request.converted_order_id is distinct from v_existing_order.id then
      update public.availability_requests
      set status = 'converted',
          converted_order_id = v_existing_order.id,
          updated_at = v_now
      where id = p_request_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'order_id', v_existing_order.id,
      'replayed', true,
      'order', jsonb_build_object(
        'id', v_existing_order.id,
        'total', v_existing_order.total,
        'status', v_existing_order.status,
        'payment_status', v_existing_order.payment_status
      )
    );
  end if;

  if v_request.status = 'converted' then
    return jsonb_build_object(
      'ok', false,
      'code', 'CONVERTED_ORDER_MISSING',
      'error', 'This availability request is marked converted but its order is missing.'
    );
  end if;

  if v_request.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'AVAILABILITY_PAYMENT_EXPIRED',
      'error', 'The payment window has expired.'
    );
  end if;

  if v_request.status <> 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'REQUEST_NOT_READY',
      'error', 'This request is not ready for payment.'
    );
  end if;

  if v_request.payment_expires_at is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'PAYMENT_DEADLINE_MISSING',
      'error', 'This confirmed request is missing a payment deadline.'
    );
  end if;

  if v_request.payment_expires_at <= v_now then
    update public.availability_requests
    set status = 'expired',
        updated_at = v_now
    where id = p_request_id
      and status = 'confirmed';

    return jsonb_build_object(
      'ok', false,
      'code', 'AVAILABILITY_PAYMENT_EXPIRED',
      'error', 'The payment window has expired.'
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where quantity is null
         or quantity <= 0
         or coalesce(confirmed_unit_price, submitted_unit_price) is null
         or coalesce(confirmed_unit_price, submitted_unit_price) < 0
         or (
           requires_confirmation
           and (resolution_status <> 'confirmed' or confirmed_unit_price is null)
         )
         or (
           not requires_confirmation
           and resolution_status <> 'not_required'
         )
    )::integer,
    coalesce(
      round(sum(quantity * coalesce(confirmed_unit_price, submitted_unit_price)), 2),
      0
    )::numeric(12,2)
  into v_active_count, v_invalid_count, v_total
  from public.availability_request_items
  where request_id = p_request_id
    and customer_removed_at is null;

  if v_active_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_CONFIRMED_ITEMS',
      'error', 'This request has no active confirmed items.'
    );
  end if;

  if v_invalid_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_CONFIRMED_ITEMS',
      'error', 'This request contains an item that is not in a payable confirmed state.'
    );
  end if;

  if v_request.final_total is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'CONFIRMED_TOTAL_MISSING',
      'error', 'This confirmed request is missing its final total.'
    );
  end if;

  if round(v_request.final_total, 2) <> v_total then
    return jsonb_build_object(
      'ok', false,
      'code', 'CONFIRMED_TOTAL_MISMATCH',
      'error', 'The confirmed basket total no longer matches its confirmed items.'
    );
  end if;

  insert into public.orders (
    user_id,
    total,
    subtotal,
    delivery_fee,
    status,
    payment_status,
    payment_method,
    market_id,
    currency_code,
    delivery_address,
    delivery_contact_name,
    delivery_contact_phone,
    customer_note,
    delivery_instructions,
    fulfillment_type,
    availability_request_id
  ) values (
    p_user_id,
    v_total,
    v_total,
    0,
    'pending',
    'awaiting_payment',
    'moniepoint_transfer',
    v_request.market_id,
    v_request.currency_code,
    v_request.delivery_address,
    v_request.customer_name,
    v_request.customer_phone,
    v_request.customer_note,
    'Delivery scheduling starts 24 hours after verified payment.',
    'delivery',
    v_request.id
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    variant_id,
    quantity,
    price,
    currency_code,
    size_preference,
    fulfillment_note
  )
  select
    v_order.id,
    item.product_id::integer,
    item.variant_id,
    item.quantity,
    coalesce(item.confirmed_unit_price, item.submitted_unit_price),
    v_request.currency_code,
    item.size_preference,
    'Closest reasonable preference may be used to keep fulfilment fast. Delivery scheduling starts 24 hours after verified payment.'
  from public.availability_request_items item
  where item.request_id = p_request_id
    and item.customer_removed_at is null
  order by item.created_at, item.id;

  update public.availability_requests
  set status = 'converted',
      converted_order_id = v_order.id,
      updated_at = v_now
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'replayed', false,
    'order', jsonb_build_object(
      'id', v_order.id,
      'total', v_order.total,
      'status', v_order.status,
      'payment_status', v_order.payment_status
    )
  );
end;
$$;

revoke all on function public.convert_availability_request_to_order(uuid, uuid) from public;
revoke all on function public.convert_availability_request_to_order(uuid, uuid) from anon;
revoke all on function public.convert_availability_request_to_order(uuid, uuid) from authenticated;
grant execute on function public.convert_availability_request_to_order(uuid, uuid) to service_role;

comment on function public.convert_availability_request_to_order(uuid, uuid) is
  'Atomically locks and validates a confirmed availability request, creates one payable order with its items, and marks the request converted. Safe for retries.';
