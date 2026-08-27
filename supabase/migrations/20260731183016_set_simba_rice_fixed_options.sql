alter table public.product_variants
  add column if not exists display_label text;

comment on column public.product_variants.display_label is
  'Exact customer-facing label for a fixed product option, such as 1 Congo (1.5kg).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_display_label_nonblank'
  ) then
    alter table public.product_variants
      add constraint product_variants_display_label_nonblank
      check (display_label is null or btrim(display_label) <> '');
  end if;
end
$$;

alter table public.product_variants drop column if exists size_label;

alter table public.product_variants
  add column size_label text generated always as (
    case
      when display_label is not null then btrim(display_label)
      when local_measurement_equivalent is not null then
        coalesce(nullif(btrim(size), ''), nullif(btrim(name), ''), 'Option')
        || ' (≈ ' || btrim(local_measurement_equivalent) || ')'
      else coalesce(nullif(btrim(size), ''), nullif(btrim(name), ''), 'Option')
    end
  ) stored;

comment on column public.product_variants.size_label is
  'Generated customer-facing option label. Exact display_label takes priority over derived measurement text.';

do $$
declare
  p_id bigint;
  p_market_id uuid;
begin
  select id into p_id
  from public.products
  where sku = 'SIMBA-RICE-50KG' or name = 'Simba Rice'
  order by case when sku = 'SIMBA-RICE-50KG' then 0 else 1 end, id
  limit 1;

  if p_id is null then
    raise exception 'Simba Rice product was not found';
  end if;

  p_market_id := public.default_market_id();

  update public.products
  set
    name = 'Simba Rice',
    local_name = 'Rice - Simba',
    sku = 'SIMBA-RICE-50KG',
    description = 'Simba branded rice sold only through fixed customer-selectable size options. Custom or loose quantity entry is not available.',
    brand = 'Simba',
    product_family = 'Branded Rice',
    source_pack_quantity = 50,
    source_pack_unit = 'kg',
    is_portioned = true,
    updated_at = now()
  where id = p_id;

  delete from public.product_variants
  where product_id = p_id;

  insert into public.product_variants (
    product_id,
    name,
    display_label,
    unit,
    price,
    old_price,
    stock_count,
    size,
    base_unit,
    base_quantity,
    is_default,
    is_active,
    market_id,
    currency_code,
    purchase_mode,
    min_quantity,
    max_quantity,
    step_quantity,
    option_role,
    local_measurement_equivalent
  )
  values
    (p_id, '1kg', '1kg', 'pack', 1399, null, 0, '1kg', 'kg', 1, true, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (p_id, '1 Congo (1.5kg)', '1 Congo (1.5kg)', 'pack', 2269, null, 0, '1.5kg', 'kg', 1.5, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Congo'),
    (p_id, 'Half Paint Bucket (2kg)', 'Half Paint Bucket (2kg)', 'pack', 2809, null, 0, '2kg', 'kg', 2, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Paint Bucket'),
    (p_id, '1 Paint Bucket (4kg)', '1 Paint Bucket (4kg)', 'pack', 5519, null, 0, '4kg', 'kg', 4, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (p_id, 'Quarter Bag (12.5kg)', 'Quarter Bag (12.5kg)', 'pack', 14959, null, 0, '12.5kg', 'kg', 12.5, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Quarter Bag'),
    (p_id, 'Half Bag (25kg)', 'Half Bag (25kg)', 'pack', 29819, null, 0, '25kg', 'kg', 25, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Bag'),
    (p_id, '50kg', '50kg', 'pack', 59529, null, 0, '50kg', 'kg', 50, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null);
end
$$;;
