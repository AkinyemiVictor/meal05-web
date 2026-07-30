-- Activate OPay transfer only when procurement-provided account details exist.
-- This keeps the public method fail-closed on environments that have not been configured.

update public.payment_provider_settings
set is_active = true,
    checkout_enabled = true,
    wallet_topup_enabled = true,
    customer_notice = coalesce(nullif(customer_notice, ''), 'Transfer the exact amount to the Meal05 OPay account.'),
    updated_at = now()
where code = 'opay_transfer'
  and method_type = 'bank_transfer'
  and nullif(btrim(coalesce(bank_name, '')), '') is not null
  and nullif(btrim(coalesce(account_name, '')), '') is not null
  and nullif(btrim(coalesce(account_number, '')), '') is not null
  and bank_name not like '{{%}}'
  and account_name not like '{{%}}'
  and account_number not like '{{%}}';
