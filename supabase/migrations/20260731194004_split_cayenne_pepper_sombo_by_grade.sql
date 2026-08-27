do $$
declare
  grade_a_id bigint;
  grade_b_id bigint;
  base_product_id bigint;
  pepper_category_id bigint;
  market_uuid uuid;
  source_image text;
begin
  market_uuid := public.default_market_id();

  select id into grade_a_id
  from public.products
  where sku = 'CAYENNE-PEPPER-SOMBO-GRADE-A-20KG'
  limit 1;

  if grade_a_id is null then
    select id into base_product_id
    from public.products
    where lower(coalesce(name, '')) like '%cayenne pepper%'
      and (
        lower(coalesce(name, '')) like '%sombo%'
        or lower(coalesce(name, '')) like '%shombo%'
        or lower(coalesce(local_name, '')) like '%sombo%'
        or lower(coalesce(local_name, '')) like '%shombo%'
      )
    order by id
    limit 1;

    if base_product_id is null then
      raise exception 'Existing Sombo/Shombo cayenne pepper product was not found';
    end if;

    grade_a_id := base_product_id;
  end if;

  select category_id, main_image_url
  into pepper_category_id, source_image
  from public.products
  where id = grade_a_id;

  if pepper_category_id is null then
    select id into pepper_category_id
    from public.product_categories
    where slug = 'vegetables' or lower(name) = 'vegetables'
    order by id
    limit 1;
  end if;

  update public.products
  set
    name = 'Cayenne Pepper (Sombo) - Grade A',
    local_name = 'Sombo Grade A',
    sku = 'CAYENNE-PEPPER-SOMBO-GRADE-A-20KG',
    description = 'Grade A fresh cayenne pepper, locally known as Sombo, sold only through fixed customer-selectable options.',
    category_id = pepper_category_id,
    is_active = true,
    in_season = true,
    sourcing_type = 'fresh',
    search_keywords = 'cayenne pepper, sombo, shombo, long red pepper, grade a pepper',
    brand = null,
    product_family = 'Cayenne Pepper - Grade A',
    source_pack_quantity = 20,
    source_pack_unit = 'kg',
    is_portioned = true,
    updated_at = now()
  where id = grade_a_id;

  delete from public.product_variants
  where product_id = grade_a_id;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count, size,
    base_unit, base_quantity, is_default, is_active, market_id, currency_code,
    purchase_mode, min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values
    (grade_a_id, '500g', '500g', 'pack', 3399, null, 10, '500g', 'kg', 0.5, true, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_a_id, 'Half Paint Bucket (850g)', 'Half Paint Bucket (850g)', 'pack', 5049, null, 10, '850g', 'kg', 0.85, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Paint Bucket'),
    (grade_a_id, '1kg', '1kg', 'pack', 6699, null, 10, '1kg', 'kg', 1, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_a_id, '1 Paint Bucket (1.7kg)', '1 Paint Bucket (1.7kg)', 'pack', 9999, null, 10, '1.7kg', 'kg', 1.7, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (grade_a_id, 'Quarter Bag (5kg)', 'Quarter Bag (5kg)', 'pack', 29749, null, 10, '5kg', 'kg', 5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Quarter Bag'),
    (grade_a_id, 'Half Bag (10kg)', 'Half Bag (10kg)', 'pack', 58399, null, 10, '10kg', 'kg', 10, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Bag'),
    (grade_a_id, '1 Bag (20kg)', '1 Bag (20kg)', 'pack', 116699, null, 10, '20kg', 'kg', 20, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Bag');

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values (grade_a_id, market_uuid, 'Cayenne Pepper (Sombo) - Grade A', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = excluded.is_listed;

  select id into grade_b_id
  from public.products
  where sku = 'CAYENNE-PEPPER-SOMBO-GRADE-B-20KG'
  limit 1;

  if grade_b_id is null then
    insert into public.products (
      name, local_name, description, sku, category_id, main_image_url, is_active,
      in_season, sourcing_type, search_keywords, is_price_volatile, brand,
      product_family, source_pack_quantity, source_pack_unit, is_portioned
    ) values (
      'Cayenne Pepper (Sombo) - Grade B',
      'Sombo Grade B',
      'Grade B fresh cayenne pepper, locally known as Sombo, sold only through fixed customer-selectable options.',
      'CAYENNE-PEPPER-SOMBO-GRADE-B-20KG',
      pepper_category_id,
      source_image,
      true,
      true,
      'fresh',
      'cayenne pepper, sombo, shombo, long red pepper, grade b pepper',
      false,
      null,
      'Cayenne Pepper - Grade B',
      20,
      'kg',
      true
    ) returning id into grade_b_id;
  else
    update public.products
    set
      name = 'Cayenne Pepper (Sombo) - Grade B',
      local_name = 'Sombo Grade B',
      description = 'Grade B fresh cayenne pepper, locally known as Sombo, sold only through fixed customer-selectable options.',
      category_id = pepper_category_id,
      main_image_url = coalesce(main_image_url, source_image),
      is_active = true,
      in_season = true,
      sourcing_type = 'fresh',
      search_keywords = 'cayenne pepper, sombo, shombo, long red pepper, grade b pepper',
      brand = null,
      product_family = 'Cayenne Pepper - Grade B',
      source_pack_quantity = 20,
      source_pack_unit = 'kg',
      is_portioned = true,
      updated_at = now()
    where id = grade_b_id;
  end if;

  delete from public.product_variants
  where product_id = grade_b_id;

  insert into public.product_variants (
    product_id, name, display_label, unit, price, old_price, stock_count, size,
    base_unit, base_quantity, is_default, is_active, market_id, currency_code,
    purchase_mode, min_quantity, max_quantity, step_quantity, option_role,
    local_measurement_equivalent
  ) values
    (grade_b_id, '250g', '250g', 'pack', 1259, null, 0, '250g', 'kg', 0.25, true, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, '500g', '500g', 'pack', 2429, null, 0, '500g', 'kg', 0.5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, 'Half Paint Bucket (850g)', 'Half Paint Bucket (850g)', 'pack', 4679, null, 0, '850g', 'kg', 0.85, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Paint Bucket'),
    (grade_b_id, '1kg', '1kg', 'pack', 4749, null, 0, '1kg', 'kg', 1, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (grade_b_id, '1 Paint Bucket (1.7kg)', '1 Paint Bucket (1.7kg)', 'pack', 9249, null, 0, '1.7kg', 'kg', 1.7, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Paint Bucket'),
    (grade_b_id, 'Quarter Bag (5kg)', 'Quarter Bag (5kg)', 'pack', 22809, null, 0, '5kg', 'kg', 5, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Quarter Bag'),
    (grade_b_id, 'Half Bag (10kg)', 'Half Bag (10kg)', 'pack', 43749, null, 0, '10kg', 'kg', 10, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', 'Half Bag'),
    (grade_b_id, '1 Bag (20kg)', '1 Bag (20kg)', 'pack', 90929, null, 0, '20kg', 'kg', 20, false, true, market_uuid, 'NGN', 'fixed', 1, null, 1, 'standard', '1 Bag');

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values (grade_b_id, market_uuid, 'Cayenne Pepper (Sombo) - Grade B', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = excluded.is_listed;

  if not exists (
    select 1 from public.product_images where product_id = grade_b_id
  ) then
    insert into public.product_images (
      product_id, variant_id, image_url, alt_text, position, is_primary,
      thumb_url, card_url, detail_url, original_url,
      image_width, image_height, normalized_at
    )
    select
      grade_b_id, null, image_url, 'Cayenne Pepper (Sombo) - Grade B', position, is_primary,
      thumb_url, card_url, detail_url, original_url,
      image_width, image_height, normalized_at
    from public.product_images
    where product_id = grade_a_id;
  end if;
end
$$;;
