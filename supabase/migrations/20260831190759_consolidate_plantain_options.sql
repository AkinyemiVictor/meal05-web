-- Present plantain as one product with three fixed quantity choices.
-- Old rows are retained but deactivated so historical order references remain valid.
do $$
declare
  plantain_product_id bigint;
  first_option_id bigint;
  second_option_id bigint;
  third_option_id bigint;
begin
  select p.id
    into plantain_product_id
  from public.products p
  where p.name in ('Plantain', 'Plantain - Medium')
  order by case when p.name = 'Plantain - Medium' then 0 else 1 end, p.id
  limit 1;

  if plantain_product_id is null then
    raise exception 'Could not find the primary Plantain product';
  end if;

  select v.id
    into first_option_id
  from public.product_variants v
  where v.product_id = plantain_product_id
    and v.name in ('6–7 Fingers', '6-7 Fingers')
  order by v.is_active desc, v.id desc
  limit 1;

  select v.id
    into second_option_id
  from public.product_variants v
  where v.product_id = plantain_product_id
    and v.name in ('10 Fingers', '12–15 Fingers (1 Hand)')
  order by v.is_active desc, v.id desc
  limit 1;

  select v.id
    into third_option_id
  from public.product_variants v
  where v.product_id = plantain_product_id
    and v.name in ('1 Whole Bunch', '30 Fingers (2 Hands)')
  order by v.is_active desc, v.id desc
  limit 1;

  if first_option_id is null or second_option_id is null or third_option_id is null then
    raise exception 'Could not identify all three Plantain option rows';
  end if;

  update public.products
  set name = 'Plantain',
      local_name = 'Plantain',
      updated_at = now()
  where id = plantain_product_id;

  update public.product_variants
  set is_active = false,
      is_default = false,
      ripeness = null,
      updated_at = now()
  where product_id = plantain_product_id;

  update public.product_variants
  set name = '6–7 Fingers',
      display_label = '6–7 Fingers',
      unit = 'pack',
      price = 2200,
      old_price = null,
      size = null,
      ripeness = null,
      base_unit = 'finger',
      base_quantity = 6.5,
      weight_raw = null,
      weight_min = null,
      weight_max = null,
      weight_unit = null,
      volume_raw = null,
      volume_min = null,
      volume_max = null,
      volume_unit = null,
      purchase_mode = 'fixed',
      min_quantity = null,
      max_quantity = null,
      step_quantity = null,
      option_role = 'standard',
      local_measurement_equivalent = null,
      availability_mode = 'standard',
      is_default = true,
      is_active = true,
      updated_at = now()
  where id = first_option_id;

  update public.product_variants
  set name = '12–15 Fingers (1 Hand)',
      display_label = '12–15 Fingers (1 Hand)',
      unit = 'pack',
      price = 4300,
      old_price = null,
      size = null,
      ripeness = null,
      base_unit = 'finger',
      base_quantity = 13.5,
      weight_raw = null,
      weight_min = null,
      weight_max = null,
      weight_unit = null,
      volume_raw = null,
      volume_min = null,
      volume_max = null,
      volume_unit = null,
      purchase_mode = 'fixed',
      min_quantity = null,
      max_quantity = null,
      step_quantity = null,
      option_role = 'standard',
      local_measurement_equivalent = null,
      availability_mode = 'standard',
      is_default = false,
      is_active = true,
      updated_at = now()
  where id = second_option_id;

  update public.product_variants
  set name = '30 Fingers (2 Hands)',
      display_label = '30 Fingers (2 Hands)',
      unit = 'pack',
      price = 8700,
      old_price = null,
      size = null,
      ripeness = null,
      base_unit = 'finger',
      base_quantity = 30,
      weight_raw = null,
      weight_min = null,
      weight_max = null,
      weight_unit = null,
      volume_raw = null,
      volume_min = null,
      volume_max = null,
      volume_unit = null,
      purchase_mode = 'fixed',
      min_quantity = null,
      max_quantity = null,
      step_quantity = null,
      option_role = 'standard',
      local_measurement_equivalent = null,
      availability_mode = 'standard',
      is_default = false,
      is_active = true,
      updated_at = now()
  where id = third_option_id;

  update public.products
  set is_active = false,
      updated_at = now()
  where id <> plantain_product_id
    and (name in ('Plantain - Small', 'Plantain - Large')
      or sku in ('PLANTAIN-SMALL', 'PLANTAIN-LARGE'));

  update public.product_variants v
  set is_active = false,
      is_default = false,
      ripeness = null,
      updated_at = now()
  from public.products p
  where v.product_id = p.id
    and p.id <> plantain_product_id
    and (p.name in ('Plantain - Small', 'Plantain - Large')
      or p.sku in ('PLANTAIN-SMALL', 'PLANTAIN-LARGE'));
end
$$;
