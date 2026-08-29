alter function public.convert_availability_request_to_order(uuid, uuid)
  rename to convert_availability_request_to_order_unchecked;

revoke all on function public.convert_availability_request_to_order_unchecked(uuid, uuid) from public;
revoke all on function public.convert_availability_request_to_order_unchecked(uuid, uuid) from anon;
revoke all on function public.convert_availability_request_to_order_unchecked(uuid, uuid) from authenticated;
revoke all on function public.convert_availability_request_to_order_unchecked(uuid, uuid) from service_role;

create function public.convert_availability_request_to_order(
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
  v_changed_count integer := 0;
begin
  if p_request_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Request and user are required.');
  end if;

  select * into v_request
  from public.availability_requests
  where id = p_request_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND', 'error', 'Availability request not found.');
  end if;

  if v_request.status <> 'confirmed' then
    return public.convert_availability_request_to_order_unchecked(p_request_id, p_user_id);
  end if;

  update public.availability_request_items as item
  set resolution_status = 'unavailable',
      confirmed_unit_price = null,
      admin_note = case
        when nullif(btrim(coalesce(item.admin_note, '')), '') is null
          then 'Availability changed before payment. Please review this item.'
        else item.admin_note || E'\nAvailability changed before payment. Please review this item.'
      end,
      updated_at = v_now
  where item.request_id = p_request_id
    and item.customer_removed_at is null
    and (
      not exists (
        select 1 from public.product_variants as variant
        where variant.id = item.variant_id
          and variant.product_id = item.product_id
          and variant.market_id = v_request.market_id
          and variant.is_active = true
      )
      or exists (
        select 1 from public.product_variants as variant
        where variant.id = item.variant_id
          and variant.product_id = item.product_id
          and variant.market_id = v_request.market_id
          and variant.is_active = true
          and (
            coalesce(variant.availability_mode, 'standard') = 'unavailable'
            or (
              coalesce(variant.inventory_tracking_mode, 'tracked') = 'tracked'
              and coalesce(variant.stock_count, 0) < item.quantity
            )
          )
      )
    );

  get diagnostics v_changed_count = row_count;
  if v_changed_count > 0 then
    update public.availability_requests
    set status = 'action_required', final_total = null, confirmed_at = null,
        payment_expires_at = null, updated_at = v_now
    where id = p_request_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'AVAILABILITY_CHANGED_BEFORE_PAYMENT',
      'error', 'One or more items changed availability before payment. Review the basket to continue.'
    );
  end if;

  update public.availability_request_items as item
  set requires_confirmation = true,
      resolution_status = 'pending',
      confirmed_unit_price = null,
      admin_note = case
        when nullif(btrim(coalesce(item.admin_note, '')), '') is null
          then 'This item now requires availability confirmation before payment.'
        else item.admin_note || E'\nThis item now requires availability confirmation before payment.'
      end,
      updated_at = v_now
  from public.product_variants as variant
  where item.request_id = p_request_id
    and item.customer_removed_at is null
    and item.requires_confirmation = false
    and item.resolution_status = 'not_required'
    and variant.id = item.variant_id
    and variant.product_id = item.product_id
    and variant.market_id = v_request.market_id
    and variant.is_active = true
    and coalesce(variant.availability_mode, 'standard') = 'request';

  get diagnostics v_changed_count = row_count;
  if v_changed_count > 0 then
    update public.availability_requests
    set status = 'checking', final_total = null, confirmed_at = null,
        payment_expires_at = null, updated_at = v_now
    where id = p_request_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'AVAILABILITY_RECONFIRMATION_REQUIRED',
      'error', 'An item now requires availability confirmation. We will reconfirm it before payment.'
    );
  end if;

  return public.convert_availability_request_to_order_unchecked(p_request_id, p_user_id);
end;
$$;

revoke all on function public.convert_availability_request_to_order(uuid, uuid) from public;
revoke all on function public.convert_availability_request_to_order(uuid, uuid) from anon;
revoke all on function public.convert_availability_request_to_order(uuid, uuid) from authenticated;
grant execute on function public.convert_availability_request_to_order(uuid, uuid) to service_role;

comment on function public.convert_availability_request_to_order(uuid, uuid) is
  'Revalidates current variant availability and tracked stock under a row lock, then atomically converts one confirmed availability request to an order. Supplier-managed stock bypasses local stock_count.';

alter table public.availability_request_items
  add constraint availability_request_items_confirmation_state_check
  check (
    (requires_confirmation and resolution_status in ('pending', 'confirmed', 'unavailable'))
    or ((not requires_confirmation) and resolution_status in ('not_required', 'unavailable'))
  );

alter table public.availability_request_items
  add constraint availability_request_items_confirmed_price_required_check
  check (resolution_status <> 'confirmed' or confirmed_unit_price is not null);

create or replace function public.verify_paystack_payment(
  p_order_id bigint,
  p_reference text,
  p_amount numeric,
  p_currency text default 'NGN'::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_order_id is null or p_order_id < 1 or p_order_id > 2147483647 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ORDER_ID', 'error', 'Invalid order id.');
  end if;

  return public.mark_paystack_order_paid(p_order_id::integer, p_reference, p_amount, p_currency);
end;
$$;

revoke all on function public.verify_paystack_payment(bigint, text, numeric, text) from public;
revoke all on function public.verify_paystack_payment(bigint, text, numeric, text) from anon;
revoke all on function public.verify_paystack_payment(bigint, text, numeric, text) from authenticated;
grant execute on function public.verify_paystack_payment(bigint, text, numeric, text) to service_role;

comment on function public.verify_paystack_payment(bigint, text, numeric, text) is
  'Legacy server-only compatibility wrapper. Delegates to mark_paystack_order_paid so stock deduction respects inventory_tracking_mode.';;
