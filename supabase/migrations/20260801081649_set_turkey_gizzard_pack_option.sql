do $$
declare
  p_id bigint;
  p_market_id uuid;
begin
  p_market_id := public.default_market_id();

  select id into p_id
  from public.products
  where id = 239 or lower(name) like '%turkey%gizzard%'
  order by case when id = 239 then 0 else 1 end, id
  limit 1;

  if p_id is null then
    raise exception 'Turkey Gizzard product was not found';
  end if;

  update public.products
  set
    name = 'Turkey Gizzard',
    local_name = 'Turkey Gizzard',
    sku = 'TURKEY-GIZZARD-12PCS-PACK',
    description = 'Turkey gizzard sold as a fixed pack of approximately 12 pieces.',
    category_id = 8,
    is_active = true,
    in_season = true,
    sourcing_type = 'fresh',
    product_family = 'Poultry Offal',
    source_pack_quantity = 12,
    source_pack_unit = 'piece',
    is_portioned = false,
    updated_at = now()
  where id = p_id;

  delete from public.product_variants
  where product_id = p_id;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active,
    market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values (
    p_id,
    '1 Pack (12 Pieces)',
    '1 Pack (12 Pieces)',
    'pack',
    9859,
    null,
    10,
    '12 pieces',
    'piece',
    12,
    true,
    true,
    p_market_id,
    'NGN',
    'fixed',
    1,
    null,
    1,
    'standard',
    '1 Pack'
  );

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values (p_id, p_market_id, 'Turkey Gizzard', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = true;
end
$$;;
