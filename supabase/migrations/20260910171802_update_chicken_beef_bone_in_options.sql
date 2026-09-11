-- Replace the shopper-selectable options for frozen broiler chicken and
-- bone-in beef without deleting variant rows referenced by historical carts,
-- orders, price history, or inventory records.
do $$
declare
  v_market_id uuid := public.default_market_id();
  v_chicken_id bigint;
  v_beef_id bigint;
  v_chicken_stock numeric;
  v_beef_stock numeric;
begin
  select p.id
  into v_chicken_id
  from public.products p
  where p.sku = 'FROZEN-BROILER-CHICKEN-10KG'
     or p.name in ('Frozen Broiler Chicken', 'Frozen Chicken - Broiler', 'Chicken')
  order by case when p.sku = 'FROZEN-BROILER-CHICKEN-10KG' then 0 else 1 end, p.id
  limit 1;

  select p.id
  into v_beef_id
  from public.products p
  where p.sku = 'COW-MEAT-ASSORTED'
     or p.name in ('Beef Bone-in Cuts', 'Cow Meat Assorted')
  order by case when p.sku = 'COW-MEAT-ASSORTED' then 0 else 1 end, p.id
  limit 1;

  if v_chicken_id is null then
    raise exception 'Frozen broiler chicken product was not found';
  end if;
  if v_beef_id is null then
    raise exception 'Beef bone-in cuts product was not found';
  end if;

  select coalesce(max(pv.stock_count), 0)
  into v_chicken_stock
  from public.product_variants pv
  where pv.product_id = v_chicken_id
    and pv.market_id = v_market_id
    and pv.is_active = true;

  select coalesce(max(pv.stock_count), 0)
  into v_beef_stock
  from public.product_variants pv
  where pv.product_id = v_beef_id
    and pv.market_id = v_market_id
    and pv.is_active = true;

  update public.products
  set source_pack_quantity = 9,
      source_pack_unit = 'kg',
      is_portioned = true,
      selection_model = 'exact_variant',
      updated_at = now()
  where id = v_chicken_id;

  update public.products
  set name = 'Beef Bone-in Cuts',
      local_name = 'Cow Meat - Bone-in',
      description = 'Fresh beef portions with bone, sold through fixed weight and carton options.',
      product_family = 'Beef',
      source_pack_quantity = 9,
      source_pack_unit = 'kg',
      is_portioned = true,
      selection_model = 'exact_variant',
      updated_at = now()
  where id = v_beef_id;

  update public.product_markets
  set local_name = 'Beef Bone-in Cuts',
      is_listed = true
  where product_id = v_beef_id
    and market_id = v_market_id;

  -- Keep old rows available for historical references but remove them from all
  -- active catalogue and quick-add option queries.
  update public.product_variants
  set is_active = false,
      is_default = false,
      updated_at = now()
  where product_id in (v_chicken_id, v_beef_id)
    and market_id = v_market_id
    and is_active = true;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count, size,
    base_unit, base_quantity, weight_min, weight_max, weight_unit,
    is_default, is_active, market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent, availability_mode, inventory_tracking_mode
  ) values
    (v_chicken_id, '500g', '500g', 'pack', 2750, null, v_chicken_stock, '500g',
      'kg', 0.5, null, null, null, true, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', null, 'standard', 'tracked'),
    (v_chicken_id, '1kg', '1kg', 'pack', 5500, null, v_chicken_stock, '1kg',
      'kg', 1, null, null, null, false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', null, 'standard', 'tracked'),
    (v_chicken_id, 'Quarter Carton (2–2.25kg)', 'Quarter Carton (2–2.25kg)', 'carton', 11688, null, v_chicken_stock, '2–2.25kg',
      'kg', null, 2, 2.25, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', 'Quarter Carton', 'standard', 'tracked'),
    (v_chicken_id, 'Half Carton (4–4.5kg)', 'Half Carton (4–4.5kg)', 'carton', 23375, null, v_chicken_stock, '4–4.5kg',
      'kg', null, 4, 4.5, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', 'Half Carton', 'standard', 'tracked'),
    (v_chicken_id, '1 Carton (8–9kg)', '1 Carton (8–9kg)', 'carton', 46750, null, v_chicken_stock, '8–9kg',
      'kg', null, 8, 9, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', '1 Carton', 'standard', 'tracked'),

    (v_beef_id, '500g', '500g', 'pack', 3750, null, v_beef_stock, '500g',
      'kg', 0.5, null, null, null, true, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', null, 'standard', 'tracked'),
    (v_beef_id, '1kg', '1kg', 'pack', 7500, null, v_beef_stock, '1kg',
      'kg', 1, null, null, null, false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', null, 'standard', 'tracked'),
    (v_beef_id, 'Quarter Carton (2–2.25kg)', 'Quarter Carton (2–2.25kg)', 'carton', 15938, null, v_beef_stock, '2–2.25kg',
      'kg', null, 2, 2.25, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', 'Quarter Carton', 'standard', 'tracked'),
    (v_beef_id, 'Half Carton (4–4.5kg)', 'Half Carton (4–4.5kg)', 'carton', 31875, null, v_beef_stock, '4–4.5kg',
      'kg', null, 4, 4.5, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', 'Half Carton', 'standard', 'tracked'),
    (v_beef_id, '1 Carton (8–9kg)', '1 Carton (8–9kg)', 'carton', 63750, null, v_beef_stock, '8–9kg',
      'kg', null, 8, 9, 'kg', false, true, v_market_id, 'NGN', 'fixed',
      1, null, 1, 'standard', '1 Carton', 'standard', 'tracked');
end;
$$;

notify pgrst, 'reload schema';
