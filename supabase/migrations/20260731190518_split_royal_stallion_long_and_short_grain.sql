do $$
declare
  old_product_id bigint;
  long_product_id bigint;
  short_product_id bigint;
  grain_category_id bigint;
  existing_image_url text;
  p_market_id uuid;
begin
  p_market_id := public.default_market_id();

  select id, category_id, main_image_url
    into old_product_id, grain_category_id, existing_image_url
  from public.products
  where name ilike '%Royal Stallion Rice%'
     or local_name ilike '%Royal Stallion%'
  order by case when name = 'Royal Stallion Rice' then 0 else 1 end, id
  limit 1;

  if old_product_id is null then
    raise exception 'Existing Royal Stallion Rice product was not found';
  end if;

  long_product_id := old_product_id;

  update public.products
  set
    name = 'Royal Stallion Rice - Long Grain',
    local_name = 'Rice - Royal Stallion (Long Grain)',
    sku = 'ROYAL-STALLION-RICE-LONG-50KG',
    description = 'Royal Stallion branded long grain rice sold only through fixed customer-selectable options. Custom or loose quantity entry is not available.',
    category_id = grain_category_id,
    main_image_url = existing_image_url,
    is_active = true,
    in_season = true,
    sourcing_type = 'staple',
    search_keywords = 'royal stallion rice, stallion long grain rice, branded rice, long grain rice',
    is_price_volatile = false,
    brand = 'Royal Stallion',
    product_family = 'Branded Rice - Long Grain',
    source_pack_quantity = 50,
    source_pack_unit = 'kg',
    is_portioned = true,
    updated_at = now()
  where id = long_product_id;

  delete from public.product_variants
  where product_id = long_product_id;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active, market_id,
    currency_code, purchase_mode, min_quantity, max_quantity, step_quantity,
    option_role, local_measurement_equivalent
  )
  values
    (long_product_id, 'Half Derica (400g)', 'Half Derica (400g)', 'pack', 839, null, 0, '400g', 'kg', 0.4, true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Derica'),
    (long_product_id, '1 Derica (800g)', '1 Derica (800g)', 'pack', 1569, null, 0, '800g', 'kg', 0.8, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Derica'),
    (long_product_id, '1kg', '1kg', 'pack', 1939, null, 0, '1kg', 'kg', 1, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (long_product_id, '1 Paint Bucket (4kg)', '1 Paint Bucket (4kg)', 'pack', 7459, null, 0, '4kg', 'kg', 4, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (long_product_id, '25kg', '25kg', 'pack', 44409, null, 0, '25kg', 'kg', 25, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (long_product_id, '50kg', '50kg', 'pack', 88709, null, 0, '50kg', 'kg', 50, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null);

  update public.product_markets
  set local_name = 'Rice - Royal Stallion (Long Grain)', is_listed = true
  where product_id = long_product_id and market_id = p_market_id;

  if not exists (
    select 1 from public.product_markets
    where product_id = long_product_id and market_id = p_market_id
  ) then
    insert into public.product_markets (product_id, market_id, local_name, is_listed)
    values (long_product_id, p_market_id, 'Rice - Royal Stallion (Long Grain)', true);
  end if;

  select id into short_product_id
  from public.products
  where sku = 'ROYAL-STALLION-RICE-SHORT-20KG'
     or name = 'Royal Stallion Rice - Short Grain'
  order by id
  limit 1;

  if short_product_id is null then
    insert into public.products (
      name, local_name, description, sku, category_id, main_image_url,
      is_active, in_season, sourcing_type, search_keywords,
      is_price_volatile, brand, product_family,
      source_pack_quantity, source_pack_unit, is_portioned
    )
    values (
      'Royal Stallion Rice - Short Grain',
      'Rice - Royal Stallion (Short Grain)',
      'Royal Stallion branded short grain rice sold only through fixed customer-selectable options. Custom or loose quantity entry is not available.',
      'ROYAL-STALLION-RICE-SHORT-20KG',
      grain_category_id,
      existing_image_url,
      true,
      true,
      'staple',
      'royal stallion rice, stallion short grain rice, branded rice, short grain rice',
      false,
      'Royal Stallion',
      'Branded Rice - Short Grain',
      20,
      'kg',
      true
    )
    returning id into short_product_id;
  else
    update public.products
    set
      name = 'Royal Stallion Rice - Short Grain',
      local_name = 'Rice - Royal Stallion (Short Grain)',
      description = 'Royal Stallion branded short grain rice sold only through fixed customer-selectable options. Custom or loose quantity entry is not available.',
      sku = 'ROYAL-STALLION-RICE-SHORT-20KG',
      category_id = grain_category_id,
      main_image_url = existing_image_url,
      is_active = true,
      in_season = true,
      sourcing_type = 'staple',
      search_keywords = 'royal stallion rice, stallion short grain rice, branded rice, short grain rice',
      is_price_volatile = false,
      brand = 'Royal Stallion',
      product_family = 'Branded Rice - Short Grain',
      source_pack_quantity = 20,
      source_pack_unit = 'kg',
      is_portioned = true,
      updated_at = now()
    where id = short_product_id;
  end if;

  delete from public.product_variants
  where product_id = short_product_id;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active, market_id,
    currency_code, purchase_mode, min_quantity, max_quantity, step_quantity,
    option_role, local_measurement_equivalent
  )
  values
    (short_product_id, 'Half Derica (400g)', 'Half Derica (400g)', 'pack', 929, null, 0, '400g', 'kg', 0.4, true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Derica'),
    (short_product_id, '1 Derica (800g)', '1 Derica (800g)', 'pack', 1749, null, 0, '800g', 'kg', 0.8, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Derica'),
    (short_product_id, '1kg', '1kg', 'pack', 2159, null, 0, '1kg', 'kg', 1, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (short_product_id, '1 Paint Bucket (4kg)', '1 Paint Bucket (4kg)', 'pack', 8329, null, 0, '4kg', 'kg', 4, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (short_product_id, '20kg', '20kg', 'pack', 39719, null, 0, '20kg', 'kg', 20, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null);

  update public.product_markets
  set local_name = 'Rice - Royal Stallion (Short Grain)', is_listed = true
  where product_id = short_product_id and market_id = p_market_id;

  if not exists (
    select 1 from public.product_markets
    where product_id = short_product_id and market_id = p_market_id
  ) then
    insert into public.product_markets (product_id, market_id, local_name, is_listed)
    values (short_product_id, p_market_id, 'Rice - Royal Stallion (Short Grain)', true);
  end if;

  delete from public.product_images
  where product_id = short_product_id;

  insert into public.product_images (
    product_id, variant_id, image_url, alt_text, position, is_primary,
    thumb_url, card_url, detail_url, original_url,
    image_width, image_height, normalized_at
  )
  select
    short_product_id,
    null,
    image_url,
    'Royal Stallion Rice - Short Grain',
    position,
    is_primary,
    thumb_url,
    card_url,
    detail_url,
    original_url,
    image_width,
    image_height,
    normalized_at
  from public.product_images
  where product_id = long_product_id;
end
$$;;
