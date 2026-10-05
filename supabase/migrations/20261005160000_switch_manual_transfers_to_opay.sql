-- Make the Meal05 OPay account the only active manual-transfer destination.
-- Historical completed Moniepoint records are retained for audit purposes.

insert into public.payment_provider_settings (
  code,
  display_name,
  method_type,
  is_active,
  is_recommended,
  checkout_enabled,
  wallet_topup_enabled,
  display_order,
  bank_name,
  account_name,
  account_number,
  logo_url,
  customer_notice
) values (
  'opay_transfer',
  'OPay Transfer',
  'bank_transfer',
  true,
  false,
  true,
  true,
  1,
  'Opay',
  'MEAL05 LTD',
  '6549719431',
  '/assets/icons/png/thumbnails/bank logos thumbnails/opay logo.png',
  'Transfer the exact amount shown to the Meal05 OPay account. Include the Meal05 payment reference in your transfer narration where your bank supports it. Payment remains pending until Meal05 confirms receipt.'
)
on conflict (code) do update
set display_name = excluded.display_name,
    method_type = excluded.method_type,
    is_active = excluded.is_active,
    is_recommended = false,
    checkout_enabled = excluded.checkout_enabled,
    wallet_topup_enabled = excluded.wallet_topup_enabled,
    display_order = excluded.display_order,
    bank_name = excluded.bank_name,
    account_name = excluded.account_name,
    account_number = excluded.account_number,
    logo_url = excluded.logo_url,
    customer_notice = excluded.customer_notice,
    updated_at = now();

update public.payment_provider_settings
set is_active = false,
    is_recommended = false,
    checkout_enabled = false,
    wallet_topup_enabled = false,
    display_order = 2,
    updated_at = now()
where code = 'moniepoint_transfer';

update public.payment_provider_settings
set is_recommended = true,
    updated_at = now()
where code = 'opay_transfer';

update public.wallet_settings
set monnify_topups_enabled = false,
    opay_topups_enabled = true,
    updated_at = now()
where id = true;

-- Move only unfinished transfers to the new destination. Settled records keep
-- their original provider so historical financial reporting remains accurate.
update public.payments
set provider_code = 'opay_transfer',
    method = 'opay_transfer',
    updated_at = now()
where provider_code = 'moniepoint_transfer'
  and status in ('pending', 'awaiting_transfer', 'submitted', 'processing');

update public.wallet_topups
set provider = 'opay_transfer',
    metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{providerCode}', '"opay_transfer"'::jsonb, true),
    updated_at = now()
where provider = 'moniepoint_transfer'
  and status in ('pending', 'awaiting_transfer', 'submitted', 'processing');

update public.orders
set payment_method = 'opay_transfer',
    updated_at = now()
where payment_method = 'moniepoint_transfer'
  and payment_status in ('pending', 'awaiting_payment', 'processing');

-- The availability-request conversion function was introduced with a literal
-- default provider. Rewrite that literal without duplicating the full function.
do $$
declare
  function_definition text;
begin
  if to_regprocedure('public.convert_availability_request_to_order(uuid,uuid)') is not null then
    select pg_get_functiondef('public.convert_availability_request_to_order(uuid,uuid)'::regprocedure)
      into function_definition;
    if position('moniepoint_transfer' in function_definition) > 0 then
      execute replace(function_definition, '''moniepoint_transfer''', '''opay_transfer''');
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
