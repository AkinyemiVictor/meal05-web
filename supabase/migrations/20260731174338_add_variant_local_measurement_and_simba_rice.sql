alter table public.product_variants
  add column if not exists local_measurement_equivalent text;

comment on column public.product_variants.local_measurement_equivalent is
  'Customer-facing local market measurement equivalent for this variant, for example 1 Congo, 1 bottle, or 1 paint bucket.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_local_measurement_equivalent_check'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_local_measurement_equivalent_check
      check (
        local_measurement_equivalent is null
        or length(btrim(local_measurement_equivalent)) > 0
      );
  end if;
end
$$;

do $$
declare
  v_category_id bigint;
  v_product_id bigint;
  v_variant_id bigint;
begin
  select id
    into v_category_id
  from public.product_categories
  where slug = 'grains-cereals'
     or lower(name) = 'grains & cereals'
  order by case when slug = 'grains-cereals' then 0 else 1 end, id
  limit 1;

  if v_category_id is null then
    raise exception 'Grains & Cereals category was not found';
  end if;

  insert into public.products (
    name,
    description,
    sku,
    category_id,
    is_active,
    in_season,
    sourcing_type,
    local_name,
    search_keywords,
    is_price_volatile,
    brand,
    product_family
  )
  values (
    'Simba Rice',
    'Simba branded packaged rice. The 1.5 kg pack is approximately equivalent to 1 Congo.',
    'SIMBA-RICE-1.5KG',
    v_category_id,
    true,
    true,
    'staple',
    'Rice - Simba',
    'simba rice, packaged rice, 1.5kg rice, one congo rice, grains and cereals',
    false,
    'Simba',
    'Packaged Rice'
  )
  on conflict (sku) do update
  set
    name = excluded.name,
    description = excluded.description,
    category_id = excluded.category_id,
    is_active = excluded.is_active,
    in_season = excluded.in_season,
    sourcing_type = excluded.sourcing_type,
    local_name = excluded.local_name,
    search_keywords = excluded.search_keywords,
    is_price_volatile = excluded.is_price_volatile,
    brand = excluded.brand,
    product_family = excluded.product_family,
    updated_at = now()
  returning id into v_product_id;

  select id
    into v_variant_id
  from public.product_variants
  where product_id = v_product_id
    and (
      name = '1.5 kg'
      or (base_unit = 'kg' and base_quantity = 1.5)
    )
  order by id
  limit 1;

  if v_variant_id is null then
    insert into public.product_variants (
      product_id,
      name,
      unit,
      price,
      old_price,
      stock_count,
      size,
      base_unit,
      base_quantity,
      is_default,
      is_active,
      currency_code,
      purchase_mode,
      min_quantity,
      max_quantity,
      step_quantity,
      option_role,
      local_measurement_equivalent
    )
    values (
      v_product_id,
      '1.5 kg',
      'pack',
      2269,
      null,
      0,
      '1.5 kg',
      'kg',
      1.5,
      true,
      true,
      'NGN',
      'fixed',
      1,
      null,
      1,
      'standard',
      '1 Congo'
    );
  else
    update public.product_variants
    set
      name = '1.5 kg',
      unit = 'pack',
      price = 2269,
      old_price = null,
      size = '1.5 kg',
      base_unit = 'kg',
      base_quantity = 1.5,
      is_default = true,
      is_active = true,
      currency_code = 'NGN',
      purchase_mode = 'fixed',
      min_quantity = 1,
      max_quantity = null,
      step_quantity = 1,
      option_role = 'standard',
      local_measurement_equivalent = '1 Congo',
      updated_at = now()
    where id = v_variant_id;
  end if;
end
$$;;
