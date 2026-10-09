begin;

-- Storefront reads are public. All writes go through authenticated server routes
-- using the service role after the existing admin/validation checks.
drop policy if exists product_mode_settings_admin_all on public.product_mode_settings;
drop policy if exists product_variant_mode_settings_admin_all on public.product_variant_mode_settings;
drop policy if exists business_quote_requests_admin_all on public.business_quote_requests;
drop policy if exists business_quote_items_admin_all on public.business_quote_items;

create index if not exists business_quote_items_product_idx
  on public.business_quote_items(product_id)
  where product_id is not null;
create index if not exists business_quote_items_variant_idx
  on public.business_quote_items(variant_id)
  where variant_id is not null;

commit;
