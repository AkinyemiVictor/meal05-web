-- port the single voucher into the modern promo_codes table
INSERT INTO public.promo_codes
  (code, description, discount_type, discount_value, usage_limit, usage_count, starts_at, expires_at, is_active)
SELECT upper(btrim(code)), description, 'percent', discount_percent, max_uses, used_count, valid_from, valid_to, active
FROM public.vouchers
WHERE upper(btrim(code)) NOT IN (SELECT code FROM public.promo_codes);

-- retire the legacy voucher tables (rows preserved in backup schema)
DROP TABLE public.voucher_uses;
DROP TABLE public.vouchers;
