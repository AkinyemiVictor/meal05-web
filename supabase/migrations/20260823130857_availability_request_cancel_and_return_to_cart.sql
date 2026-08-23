-- Make availability-request cancellation and cart restoration atomic, safe to retry,
-- and authoritative against the current catalogue state.

alter table public.availability_requests
  add column if not exists returned_to_cart_at timestamptz;

create or replace function public.cancel_availability_request(
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
  v_now timestamptz := now();
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

  if v_request.status = 'converted' then
    return jsonb_build_object(
      'ok', false,
      'code', 'REQUEST_ALREADY_CONVERTED',
      'error', 'This request has already been converted to an order.'
    );
  end if;

  if v_request.status in ('cancelled', 'expired') then
    return jsonb_build_object(
      'ok', true,
      'status', v_request.status,
      'replayed', true
    );
  end if;

  update public.availability_requests
  set status = 'cancelled',
      final_total = null,
      confirmed_at = null,
      payment_expires_at = null,
      updated_at = v_now
  where id = p_request_id
    and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'cancelled',
    'replayed', false
  );
end;
$$;

revoke all on function public.cancel_availability_request(uuid, uuid) from public;
revoke all on function public.cancel_availability_request(uuid, uuid) from anon;
revoke all on function public.cancel_availability_request(uuid, uuid) from authenticated;
grant execute on function public.cancel_availability_request(uuid, uuid) to service_role;

comment on function public.cancel_availability_request(uuid, uuid) is
  'Atomically cancels a non-converted availability request and clears payable confirmation state. Safe to retry.';

create or replace function public.return_availability_request_to_cart(
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
  v_now timestamptz := now();
  v_candidate_count integer := 0;
  v_returned_count integer := 0;
  v_final_status text;
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

  if v_request.status not in ('cancelled', 'expired', 'action_required') then
    return jsonb_build_object(
      'ok', false,
      'code', 'REQUEST_NOT_RETURNABLE',
      'error', 'This request cannot be returned to the cart yet.'
    );
  end if;

  if v_request.returned_to_cart_at is not null then
    return jsonb_build_object(
      'ok', true,
      'returned', 0,
      'skipped', 0,
      'replayed', true,
      'status', v_request.status,
      'returned_to_cart_at', v_request.returned_to_cart_at
    );
  end if;

  select count(*)::integer
  into v_candidate_count
  from public.availability_request_items as item
  where item.request_id = p_request_id
    and item.customer_removed_at is null;

  with eligible as (
    select
      item.product_id,
      item.variant_id,
      item.quantity,
      item.size_preference,
      variant.name as variant_name,
      variant.price as current_price,
      coalesce(nullif(btrim(market_listing.local_name), ''), product.name, item.product_name) as product_name
    from public.availability_request_items as item
    join public.product_variants as variant
      on variant.id = item.variant_id
     and variant.product_id = item.product_id
     and variant.market_id = v_request.market_id
     and variant.is_active = true
    join public.products as product
      on product.id = item.product_id
     and product.is_active = true
    join public.product_markets as market_listing
      on market_listing.product_id = item.product_id
     and market_listing.market_id = v_request.market_id
     and market_listing.is_listed = true
    left join public.cart_items as existing_cart
      on existing_cart.user_id = p_user_id
     and existing_cart.variant_id = item.variant_id
    where item.request_id = p_request_id
      and item.customer_removed_at is null
      and item.resolution_status <> 'unavailable'
      and coalesce(variant.availability_mode, 'standard') <> 'unavailable'
      and (
        coalesce(variant.inventory_tracking_mode, 'tracked') = 'supplier'
        or coalesce(variant.stock_count, 0) >= item.quantity + coalesce(existing_cart.quantity, 0)
      )
  ), restored as (
    insert into public.cart_items (
      user_id,
      product_id,
      variant_id,
      quantity,
      unit_price_at_add,
      variant_name,
      product_name,
      size_preference,
      created_at,
      updated_at
    )
    select
      p_user_id,
      eligible.product_id::integer,
      eligible.variant_id,
      eligible.quantity,
      eligible.current_price,
      eligible.variant_name,
      eligible.product_name,
      eligible.size_preference,
      v_now,
      v_now
    from eligible
    on conflict (user_id, variant_id) do update
    set quantity = public.cart_items.quantity + excluded.quantity,
        unit_price_at_add = excluded.unit_price_at_add,
        variant_name = excluded.variant_name,
        product_name = excluded.product_name,
        size_preference = coalesce(public.cart_items.size_preference, excluded.size_preference),
        updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer into v_returned_count from restored;

  v_final_status := case
    when v_request.status = 'action_required' then 'cancelled'
    else v_request.status
  end;

  update public.availability_requests
  set status = v_final_status,
      final_total = case when v_final_status = 'cancelled' then null else final_total end,
      confirmed_at = case when v_final_status = 'cancelled' then null else confirmed_at end,
      payment_expires_at = case when v_final_status = 'cancelled' then null else payment_expires_at end,
      returned_to_cart_at = v_now,
      updated_at = v_now
  where id = p_request_id
    and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'returned', v_returned_count,
    'skipped', greatest(v_candidate_count - v_returned_count, 0),
    'replayed', false,
    'status', v_final_status,
    'returned_to_cart_at', v_now
  );
end;
$$;

revoke all on function public.return_availability_request_to_cart(uuid, uuid) from public;
revoke all on function public.return_availability_request_to_cart(uuid, uuid) from anon;
revoke all on function public.return_availability_request_to_cart(uuid, uuid) from authenticated;
grant execute on function public.return_availability_request_to_cart(uuid, uuid) to service_role;

comment on function public.return_availability_request_to_cart(uuid, uuid) is
  'Atomically restores eligible request items using current catalogue price/availability, merges with the current cart, terminates action-required requests, and is safe to retry.';
