-- Make the manual-transfer lifecycle explicit without duplicating payment state.
-- Payment evidence and timestamps remain on public.payments; public.orders keeps
-- the current payment and fulfilment states while order_status_history is the audit trail.

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

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status in ('verified', 'success') then
    return jsonb_build_object('already_processed', true, 'payment_id', v_payment.id, 'reference', v_payment.reference);
  end if;
  if v_payment.status not in ('awaiting_transfer', 'submitted', 'pending') then
    raise exception 'Payment cannot be verified from status %', v_payment.status;
  end if;

  v_reference := coalesce(v_payment.reference, v_payment.transaction_ref);

  if v_payment.purpose = 'wallet_topup' then
    select * into v_topup from public.wallet_topups where id = v_payment.wallet_topup_id for update;
    if not found then raise exception 'Wallet top-up not found'; end if;
    perform public.ensure_wallet_account(v_payment.user_id, coalesce(v_payment.currency, v_payment.currency_code, 'NGN'));
    select * into v_existing_tx from public.wallet_transactions
      where wallet_topup_id = v_topup.id and type = 'credit' and reason = 'topup' limit 1;
    if not found then
      insert into public.wallet_transactions (
        user_id, amount, type, reason, wallet_topup_id, provider, provider_reference,
        idempotency_key, external_reference, metadata, note, created_by, created_at
      ) values (
        v_payment.user_id, v_payment.amount, 'credit', 'topup', v_topup.id, v_payment.provider_code, v_reference,
        'manual-payment:' || v_payment.id::text, v_reference,
        jsonb_build_object('currencyCode', coalesce(v_payment.currency, 'NGN')),
        'Verified manual wallet deposit', p_administrator_id, now()
      );
    end if;
    update public.wallet_topups
      set status = 'successful', provider_reference = coalesce(provider_reference, v_reference),
          paid_at = coalesce(paid_at, now()), updated_at = now()
      where id = v_topup.id;
  elsif v_payment.purpose = 'order_payment' then
    select * into v_order from public.orders where id = v_payment.order_id for update;
    if not found then raise exception 'Order not found'; end if;
    if coalesce(lower(v_order.payment_status), '') not in ('confirmed', 'paid') then
      perform public.deduct_stock_for_order(v_order.id);
      update public.orders
        set payment_status = 'confirmed', payment_method = v_payment.provider_code,
            payment_reference = v_reference, payment_verified = true, status = 'confirmed', updated_at = now()
        where id = v_order.id;
      insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
        values (v_order.id, v_order.status, 'confirmed', p_administrator_id, 'Payment confirmed by administrator');
    end if;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payments
    set status = 'verified', paid_at = now(), verified_at = now(), verified_by = p_administrator_id, updated_at = now()
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
  v_order public.orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_payment_id is null or p_administrator_id is null then raise exception 'Payment and administrator are required'; end if;
  if v_reason is null then raise exception 'Rejection reason is required'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status in ('verified', 'success') then raise exception 'Verified payment cannot be rejected'; end if;

  update public.payments
    set status = 'rejected', rejected_at = now(), rejected_by = p_administrator_id,
        rejection_reason = v_reason, updated_at = now()
    where id = v_payment.id;

  if v_payment.purpose = 'wallet_topup' then
    update public.wallet_topups set status = 'rejected', failure_reason = v_reason, updated_at = now()
      where id = v_payment.wallet_topup_id;
  elsif v_payment.purpose = 'order_payment' and v_payment.order_id is not null then
    select * into v_order from public.orders where id = v_payment.order_id for update;
    if found then
      update public.orders set payment_status = 'rejected', status = 'cancelled', updated_at = now() where id = v_order.id;
      insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
        values (v_order.id, v_order.status, 'cancelled', p_administrator_id, 'Payment rejected: ' || v_reason);
    end if;
  end if;
  return jsonb_build_object('payment_id', v_payment.id, 'status', 'rejected');
end;
$$;

revoke all on function public.verify_manual_payment(integer, uuid) from public, anon, authenticated;
revoke all on function public.reject_manual_payment(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_manual_payment(integer, uuid) to service_role;
grant execute on function public.reject_manual_payment(integer, uuid, text) to service_role;
