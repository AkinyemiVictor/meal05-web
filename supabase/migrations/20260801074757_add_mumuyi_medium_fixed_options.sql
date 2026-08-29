do $$
declare
  medium_product_id bigint;
  template_product_id bigint;
  category_id_value bigint;
  image_url_value text;
  p_market_id uuid;
  source_image record;
begin
  p_market_id := public.default_market_id();

  select p.id, p.category_id, p.main_image_url
  into template_product_id, category_id_value, image_url_value
  from public.products p
  where p.sku in ('WHITE-YAM-MUMUYI-SMALL', 'WHITE-YAM-MUMUYI-BIG')
  order by case when p.sku = 'WHITE-YAM-MUMUYI-SMALL' then 0 else 1 end
  limit 1;

  if template_product_id is null then
    raise exception 'Existing Mumuyi yam template product was not found';
  end if;

  select * into source_image
  from public.product_images
  where product_id = template_product_id
  order by is_primary desc, position asc, id asc
  limit 1;

  select id into medium_product_id
  from public.products
  where sku = 'WHITE-YAM-MUMUYI-MEDIUM'
  limit 1;

  if medium_product_id is null then
    insert into public.products (
      name,
      local_name,
      sku,
      description,
      category_id,
      main_image_url,
      is_active,
      in_season,
      sourcing_type,
      product_family,
      source_pack_quantity,
      source_pack_unit,
      is_portioned,
      created_at,
      updated_at
    ) values (
      'White Yam (Mumuyi) - Medium',
      'Yam - Mumuyi (Medium)',
      'WHITE-YAM-MUMUYI-MEDIUM',
      'Medium-sized Mumuyi white yam sold through fixed tuber-count options.',
      category_id_value,
      image_url_value,
      true,
      true,
      'fresh',
      'White Yam (Mumuyi)',
      null,
      null,
      false,
      now(),
      now()
    ) returning id into medium_product_id;
  else
    update public.products
    set
      name = 'White Yam (Mumuyi) - Medium',
      local_name = 'Yam - Mumuyi (Medium)',
      description = 'Medium-sized Mumuyi white yam sold through fixed tuber-count options.',
      category_id = category_id_value,
      main_image_url = image_url_value,
      is_active = true,
      in_season = true,
      sourcing_type = 'fresh',
      product_family = 'White Yam (Mumuyi)',
      source_pack_quantity = null,
      source_pack_unit = null,
      is_portioned = false,
      updated_at = now()
    where id = medium_product_id;
  end if;

  delete from public.product_variants
  where product_id = medium_product_id;

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
  ) values
    (medium_product_id, '3 Tubers',  '3 Tubers',  'pack',  8699, null, 10, '3 tubers',  'tuber', 3,  true,  true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (medium_product_id, '6 Tubers',  '6 Tubers',  'pack', 17209, null, 10, '6 tubers',  'tuber', 6,  false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null),
    (medium_product_id, '10 Tubers', '10 Tubers', 'pack', 28769, null, 10, '10 tubers', 'tuber', 10, false, true, p_market_id, 'NGN', 'fixed', 1, null, 1, 'standard', null);

  insert into public.product_markets (product_id, market_id, local_name, is_listed)
  values (medium_product_id, p_market_id, 'Yam - Mumuyi (Medium)', true)
  on conflict (product_id, market_id)
  do update set local_name = excluded.local_name, is_listed = true;

  if source_image.id is not null
     and not exists (select 1 from public.product_images where product_id = medium_product_id) then
    insert into public.product_images (
      product_id,
      variant_id,
      image_url,
      alt_text,
      position,
      is_primary,
      thumb_url,
      card_url,
      detail_url,
      original_url,
      image_width,
      image_height,
      normalized_at
    ) values (
      medium_product_id,
      null,
      source_image.image_url,
      'Medium Mumuyi white yam',
      1,
      true,
      source_image.thumb_url,
      source_image.card_url,
      source_image.detail_url,
      source_image.original_url,
      source_image.image_width,
      source_image.image_height,
      source_image.normalized_at
    );
  end if;
end
$$;;
