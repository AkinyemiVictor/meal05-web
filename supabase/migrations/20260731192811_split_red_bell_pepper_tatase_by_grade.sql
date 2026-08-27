do $$
declare
  grade_a_id bigint;
  grade_b_id bigint;
  vegetables_id bigint;
  market_uuid uuid;
  source_main_image text;
  source_image_url text;
  source_thumb_url text;
  source_card_url text;
  source_detail_url text;
  source_original_url text;
  source_width integer;
  source_height integer;
  source_normalized_at timestamptz;
begin
  market_uuid := public.default_market_id();

  select id into vegetables_id
  from public.product_categories
  where slug = 'vegetables' or lower(name) = 'vegetables'
  order by case when slug = 'vegetables' then 0 else 1 end, id
  limit 1;

  if vegetables_id is null then
    raise exception 'Vegetables category was not found';
  end if;

  select id, main_image_url
  into grade_a_id, source_main_image
  from public.products
  where sku = 'RED-BELL-PEPPER-TATASE-GRADE-A-25KG'
     or lower(name) in ('bell pepper (red)', 'red bell pepper (tatase) - grade a')
  order by case when sku = 'RED-BELL-PEPPER-TATASE-GRADE-A-25KG' then 0 else 1 end, id
  limit 1;

  if grade_a_id is null then
    raise exception 'Existing red bell pepper product was not found';
  end if;

  select image_url, thumb_url, card_url, detail_url, original_url,
         image_width, image_height, normalized_at
  into source_image_url, source_thumb_url, source_card_url, source_detail_url,
       source_original_url, source_width, source_height, source_normalized_at
  from public.product_images
  where product_id = grade_a_id
  order by is_primary desc, position, id
  limit 1;

  source_main_image := coalesce(source_main_image, source_image_url, source_original_url);

  update public.products
  set
    name = 'Red Bell Pepper (Tatase) - Grade A',
    local_name = 'Tatase Grade A',
    sku = 'RED-BELL-PEPPER-TATASE-GRADE-A-25KG',
    description = 'Premium Grade A red bell pepper (Tatase), sold only through fixed customer-selectable weight and local-market options.',
    category_id = vegetables_id,
    main_image_url = source_main_image,
    is_active = true,
    in_season = true,
    sourcing_type = 'fresh',
    search_keywords = 'red bell pepper, tatase, tatashe, sweet pepper, grade a pepper',
    is_price_volatile = true,
    brand = null,
    product_family = 'Red Bell Pepper - Grade A',
    source_pack_quantity = 25,
    source_pack_unit = 'kg',
    is_portioned = true,
    updated_at = now()
  where id = grade_a_id;

  select id into grade_b_id
  from public.products
  where sku = 'RED-BELL-PEPPER-TATASE-GRADE-B-25KG'
     or lower(name) = 'red bell pepper (tatase) - grade b'
  order by id
  limit 1;

  if grade_b_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, main_image_url,
      is_active, in_season, sourcing_type, search_keywords,
      is_price_volatile, brand, product_family,
      source_pack_quantity, source_pack_unit, is_portioned,
      created_at, updated_at
    ) values (
      'Red Bell Pepper (Tatase) - Grade B',
      'Tatase Grade B',
      'RED-BELL-PEPPER-TATASE-GRADE-B-25KG',
      'Grade B red bell pepper (Tatase), sold only through fixed customer-selectable weight and local-market options.',
      vegetables_id,
      source_main_image,
      true,
      true,
      'fresh',
      'red bell pepper, tatase, tatashe, sweet pepper, grade b pepper',
      true,
      null,
      'Red Bell Pepper - Grade B',
      25,
      'kg',
      true,
      now(),
      now()
    ) returning id into grade_b_id;
  else
    update public.products
    set
      name = 'Red Bell Pepper (Tatase) - Grade B',
      local_name = 'Tatase Grade B',
      description = 'Grade B red bell pepper (Tatase), sold only through fixed customer-selectable weight and local-market options.',
      category_id = vegetables_id,
      main_image_url = source_main_image,
      is_active = true,
      in_season = true,
      sourcing_type = 'fresh',
      search_keywords = 'red bell pepper, tatase, tatashe, sweet pepper, grade b pepper',
      is_price_volatile = true,
      brand = null,
      product_family = 'Red Bell Pepper - Grade B',
      source_pack_quantity = 25,
      source_pack_unit = 'kg',
      is_portioned = true,
      updated_at = now()
    where id = grade_b_id;
  end if;

  delete from public.product_variants
  where product_id in (grade_a_id, grade_b_id);

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count,
    size, base_unit, base_quantity, is_default, is_active,
    market_id, currency_code, purchase_mode,
    min_quantity, max_quantity, step_quantity,
    option_role, local_measurement_equivalent
  ) values
    (grade_a_id, '500g', '500g', 'pack', 4619, null, 10, '500g', 'kg', 0.5, true,  true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_a_id, 'Half Paint Bucket (850g)', 'Half Paint Bucket (850g)', 'pack', 7209, null, 10, '850g', 'kg', 0.85, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Paint Bucket'),
    (grade_a_id, '1kg', '1kg', 'pack', 9149, null, 10, '1kg', 'kg', 1, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_a_id, '1 Paint Bucket (1.7kg)', '1 Paint Bucket (1.7kg)', 'pack', 14309, null, 10, '1.7kg', 'kg', 1.7, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (grade_a_id, 'Quarter Basket (6.25kg)', 'Quarter Basket (6.25kg)', 'pack', 44679, null, 10, '6.25kg', 'kg', 6.25, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Quarter Basket'),
    (grade_a_id, 'Half Basket (12.5kg)', 'Half Basket (12.5kg)', 'pack', 89259, null, 10, '12.5kg', 'kg', 12.5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Basket'),
    (grade_a_id, '1 Basket (25kg)', '1 Basket (25kg)', 'pack', 178409, null, 10, '25kg', 'kg', 25, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Basket'),

    (grade_b_id, '250g', '250g', 'pack', 649, null, 0, '250g', 'kg', 0.25, true,  true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, '500g', '500g', 'pack', 1199, null, 0, '500g', 'kg', 0.5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, '1kg', '1kg', 'pack', 2289, null, 0, '1kg', 'kg', 1, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, 'Half Bag (12.5kg)', 'Half Bag (12.5kg)', 'pack', 24519, null, 0, '12.5kg', 'kg', 12.5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Bag'),
    (grade_b_id, '1 Bag (25kg)', '1 Bag (25kg)', 'pack', 48929, null, 0, '25kg', 'kg', 25, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Bag');

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values
    (grade_a_id, market_uuid, 'Red Bell Pepper (Tatase) - Grade A', true),
    (grade_b_id, market_uuid, 'Red Bell Pepper (Tatase) - Grade B', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = true;

  update public.product_images
  set alt_text = 'Red Bell Pepper (Tatase) - Grade A'
  where product_id = grade_a_id and is_primary = true;

  if source_image_url is not null and not exists (
    select 1 from public.product_images where product_id = grade_b_id
  ) then
    insert into public.product_images (
      product_id, variant_id, image_url, alt_text, position, is_primary,
      thumb_url, card_url, detail_url, original_url,
      image_width, image_height, normalized_at
    ) values (
      grade_b_id, null, source_image_url,
      'Red Bell Pepper (Tatase) - Grade B', 1, true,
      source_thumb_url, source_card_url, source_detail_url, source_original_url,
      source_width, source_height, source_normalized_at
    );
  end if;
end
$$;;
