do $$
declare
  p_id bigint;
  p_market_id uuid;
begin
  select id into p_id
  from public.products
  where lower(coalesce(name, '')) = 'big bull rice'
     or lower(coalesce(local_name, '')) in ('rice - big bull', 'rice - big bull (nigerian)')
     or sku = 'BIG-BULL-RICE-50KG'
  order by id
  limit 1;

  if p_id is null then
    raise exception 'Big Bull Rice product was not found';
  end if;

  p_market_id := public.default_market_id();

  update public.products
  set
    name = 'Big Bull Rice',
    local_name = 'Rice - Big Bull (Nigerian)',
    sku = 'BIG-BULL-RICE-50KG',
    description = 'Big Bull Nigerian rice sold only through fixed customer-selectable size options. Custom or loose quantity entry is not available.',
    brand = 'Big Bull',
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
    (p_id, '1 Cup (200g)', '1 Cup (200g)', 'pack', 409, null, 0, '200g', 'kg', 0.2, true, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Cup'),
    (p_id, 'Half Derica (400g)', 'Half Derica (400g)', 'pack', 719, null, 0, '400g', 'kg', 0.4, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Derica'),
    (p_id, '1 Derica (800g)', '1 Derica (800g)', 'pack', 1349, null, 0, '800g', 'kg', 0.8, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Derica'),
    (p_id, '1kg', '1kg', 'pack', 1659, null, 0, '1kg', 'kg', 1, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (p_id, 'Half Paint Bucket (2kg)', 'Half Paint Bucket (2kg)', 'pack', 3219, null, 0, '2kg', 'kg', 2, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Paint Bucket'),
    (p_id, '1 Paint Bucket (4kg)', '1 Paint Bucket (4kg)', 'pack', 6329, null, 0, '4kg', 'kg', 4, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (p_id, '25kg', '25kg', 'pack', 31679, null, 0, '25kg', 'kg', 25, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (p_id, '1 Bag (50kg)', '1 Bag (50kg)', 'pack', 63249, null, 0, '50kg', 'kg', 50, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Bag');
end
$$;;
