do $$
declare
  existing_product_id bigint;
  small_product_id bigint;
  medium_product_id bigint;
  big_product_id bigint;
  category_id_value bigint;
  image_url_value text;
  p_market_id uuid;
  source_image record;
begin
  p_market_id := public.default_market_id();

  select p.id, p.category_id, p.main_image_url
  into existing_product_id, category_id_value, image_url_value
  from public.products p
  where p.name = 'Coconut'
     or p.sku in ('COCONUT-SMALL', 'COCONUT-MEDIUM', 'COCONUT-BIG')
  order by case when p.name = 'Coconut' then 0 else 1 end, p.id
  limit 1;

  if existing_product_id is null then
    raise exception 'Existing Coconut product was not found';
  end if;

  select * into source_image
  from public.product_images
  where product_id = existing_product_id
  order by is_primary desc, position asc, id asc
  limit 1;

  -- Reuse the original product as Medium Coconut.
  update public.products
  set
    name = 'Coconut (Medium)',
    local_name = 'Medium Coconut',
    sku = 'COCONUT-MEDIUM',
    description = 'Medium-sized whole coconut sold through fixed piece-count options.',
    category_id = category_id_value,
    main_image_url = image_url_value,
    is_active = true,
    in_season = true,
    sourcing_type = 'fresh',
    product_family = 'Coconut - Medium',
    source_pack_quantity = null,
    source_pack_unit = null,
    is_portioned = false,
    updated_at = now()
  where id = existing_product_id;

  medium_product_id := existing_product_id;

  -- Create or update Small Coconut.
  select id into small_product_id
  from public.products
  where sku = 'COCONUT-SMALL'
  limit 1;

  if small_product_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, main_image_url,
      is_active, in_season, sourcing_type, product_family,
      source_pack_quantity, source_pack_unit, is_portioned, created_at, updated_at
    ) values (
      'Coconut (Small)', 'Small Coconut', 'COCONUT-SMALL',
      'Small-sized whole coconut sold through fixed piece-count options.',
      category_id_value, image_url_value, true, true, 'fresh', 'Coconut - Small',
      null, null, false, now(), now()
    ) returning id into small_product_id;
  else
    update public.products
    set
      name = 'Coconut (Small)',
      local_name = 'Small Coconut',
      description = 'Small-sized whole coconut sold through fixed piece-count options.',
      category_id = category_id_value,
      main_image_url = image_url_value,
      is_active = true,
      in_season = true,
      sourcing_type = 'fresh',
      product_family = 'Coconut - Small',
      source_pack_quantity = null,
      source_pack_unit = null,
      is_portioned = false,
      updated_at = now()
    where id = small_product_id;
  end if;

  -- Create or update Big Coconut.
  select id into big_product_id
  from public.products
  where sku = 'COCONUT-BIG'
  limit 1;

  if big_product_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, main_image_url,
      is_active, in_season, sourcing_type, product_family,
      source_pack_quantity, source_pack_unit, is_portioned, created_at, updated_at
    ) values (
      'Coconut (Big)', 'Big Coconut', 'COCONUT-BIG',
      'Big-sized whole coconut sold through fixed piece-count options.',
      category_id_value, image_url_value, true, true, 'fresh', 'Coconut - Big',
      null, null, false, now(), now()
    ) returning id into big_product_id;
  else
    update public.products
    set
      name = 'Coconut (Big)',
      local_name = 'Big Coconut',
      description = 'Big-sized whole coconut sold through fixed piece-count options.',
      category_id = category_id_value,
      main_image_url = image_url_value,
      is_active = true,
      in_season = true,
      sourcing_type = 'fresh',
      product_family = 'Coconut - Big',
      source_pack_quantity = null,
      source_pack_unit = null,
      is_portioned = false,
      updated_at = now()
    where id = big_product_id;
  end if;

  delete from public.product_variants
  where product_id in (small_product_id, medium_product_id, big_product_id);

  -- Small Coconut options.
  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active,
    market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values
    (small_product_id, '1 Piece', '1 Piece', 'pack', 1199, null, 10, '1 piece', 'piece', 1, true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (small_product_id, 'Half Dozen', 'Half Dozen', 'pack', 6709, null, 10, '6 pieces', 'piece', 6, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Dozen'),
    (small_product_id, '1 Dozen', '1 Dozen', 'pack', 13319, null, 10, '12 pieces', 'piece', 12, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Dozen');

  -- Medium Coconut options.
  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active,
    market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values
    (medium_product_id, '1 Piece', '1 Piece', 'pack', 1219, null, 10, '1 piece', 'piece', 1, true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (medium_product_id, '2 Pieces', '2 Pieces', 'pack', 2349, null, 10, '2 pieces', 'piece', 2, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (medium_product_id, 'Half Dozen', 'Half Dozen', 'pack', 6849, null, 10, '6 pieces', 'piece', 6, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Dozen'),
    (medium_product_id, '1 Dozen', '1 Dozen', 'pack', 13589, null, 10, '12 pieces', 'piece', 12, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Dozen');

  -- Big Coconut options.
  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active,
    market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values
    (big_product_id, '1 Piece', '1 Piece', 'pack', 1509, null, 10, '1 piece', 'piece', 1, true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (big_product_id, 'Half Dozen', 'Half Dozen', 'pack', 8579, null, 10, '6 pieces', 'piece', 6, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Dozen'),
    (big_product_id, '1 Dozen', '1 Dozen', 'pack', 17059, null, 10, '12 pieces', 'piece', 12, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Dozen');

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values
    (small_product_id, p_market_id, 'Coconut (Small)', true),
    (medium_product_id, p_market_id, 'Coconut (Medium)', true),
    (big_product_id, p_market_id, 'Coconut (Big)', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = true;

  if source_image.id is not null then
    if not exists (select 1 from public.product_images where product_id = small_product_id) then
      insert into public.product_images (
        product_id, variant_id, image_url, alt_text, position, is_primary,
        thumb_url, card_url, detail_url, original_url,
        image_width, image_height, normalized_at
      ) values (
        small_product_id, null, source_image.image_url, 'Small coconut', 1, true,
        source_image.thumb_url, source_image.card_url, source_image.detail_url, source_image.original_url,
        source_image.image_width, source_image.image_height, source_image.normalized_at
      );
    end if;

    if not exists (select 1 from public.product_images where product_id = big_product_id) then
      insert into public.product_images (
        product_id, variant_id, image_url, alt_text, position, is_primary,
        thumb_url, card_url, detail_url, original_url,
        image_width, image_height, normalized_at
      ) values (
        big_product_id, null, source_image.image_url, 'Big coconut', 1, true,
        source_image.thumb_url, source_image.card_url, source_image.detail_url, source_image.original_url,
        source_image.image_width, source_image.image_height, source_image.normalized_at
      );
    end if;
  end if;
end
$$;;
