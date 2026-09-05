-- Restore the first Large Plantain choice using numeric matching so its label
-- is not sensitive to Unicode dash encoding.
do $$
declare
  large_plantain_id bigint;
begin
  select p.id
    into large_plantain_id
  from public.products p
  where p.sku = 'PLANTAIN-LARGE'
     or p.name = 'Plantain (Large)'
  order by (p.sku = 'PLANTAIN-LARGE') desc, p.id
  limit 1;

  if large_plantain_id is null then
    raise exception 'Could not resolve the Large Plantain product';
  end if;

  -- Older bulk imports supplied explicit IDs, so align the owned sequence
  -- before asking it for a new generated identifier.
  perform setval(
    pg_get_serial_sequence('public.product_variants', 'id'),
    (select max(id) from public.product_variants),
    true
  );

  insert into public.product_variants (
    id,
    product_id,
    name,
    unit,
    price,
    old_price,
    stock_count,
    size,
    ripeness,
    base_unit,
    base_quantity,
    is_default,
    is_active,
    created_at,
    updated_at,
    market_id,
    currency_code,
    purchase_mode,
    min_quantity,
    max_quantity,
    step_quantity,
    option_role,
    display_label,
    availability_mode,
    inventory_tracking_mode
  )
  select
    nextval(pg_get_serial_sequence('public.product_variants', 'id')),
    source.product_id,
    '6-7 Fingers',
    source.unit,
    4000,
    null,
    greatest(source.stock_count, 100),
    null,
    null,
    'finger',
    6.5,
    true,
    true,
    now(),
    now(),
    source.market_id,
    source.currency_code,
    'fixed',
    null,
    null,
    null,
    'standard',
    '6-7 Fingers',
    'standard',
    source.inventory_tracking_mode
  from public.product_variants source
  where source.product_id = large_plantain_id
    and source.name = '10 Fingers'
    and not exists (
      select 1
      from public.product_variants existing
      where existing.product_id = large_plantain_id
        and existing.base_unit = 'finger'
        and existing.base_quantity = 6.5
    )
  limit 1;

  update public.product_variants
  set name = '6-7 Fingers',
      display_label = '6-7 Fingers',
      is_active = true,
      is_default = true,
      availability_mode = 'standard',
      updated_at = now()
  where product_id = large_plantain_id
    and base_unit = 'finger'
    and base_quantity = 6.5;

  update public.product_variants
  set is_default = false,
      updated_at = now()
  where product_id = large_plantain_id
    and not (base_unit = 'finger' and base_quantity = 6.5);
end
$$;
