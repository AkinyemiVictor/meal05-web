do $$
declare
  p_market_id uuid;
  vegetables_category_id bigint;
  fruits_category_id bigint;
  spices_category_id bigint;
  pantry_category_id bigint;

  ogbono_id bigint;
  kerewa_id bigint;
  iru_small_id bigint;
  iru_big_id bigint;
  black_pepper_id bigint;
  moi_moi_leaf_id bigint;
  papaya_small_id bigint;
  papaya_medium_id bigint;
  papaya_big_id bigint;

  tomato_source record;
  iru_source record;
  papaya_source record;
begin
  p_market_id := public.default_market_id();

  select id into vegetables_category_id from public.product_categories where slug='vegetables' limit 1;
  select id into fruits_category_id from public.product_categories where slug='fruits' limit 1;
  select id into spices_category_id from public.product_categories where slug='spices-condiments' limit 1;
  select id into pantry_category_id from public.product_categories where slug='pantry-processed-foods' limit 1;

  if vegetables_category_id is null or fruits_category_id is null or spices_category_id is null or pantry_category_id is null then
    raise exception 'One or more required product categories are missing';
  end if;

  select pi.* into tomato_source
  from public.product_images pi
  where pi.product_id=101
  order by pi.is_primary desc, pi.position, pi.id
  limit 1;

  select pi.* into iru_source
  from public.product_images pi
  where pi.product_id=708
  order by pi.is_primary desc, pi.position, pi.id
  limit 1;

  select pi.* into papaya_source
  from public.product_images pi
  where pi.product_id=15
  order by pi.is_primary desc, pi.position, pi.id
  limit 1;

  ---------------------------------------------------------------------------
  -- Bush Mango Seeds (Ogbono)
  ---------------------------------------------------------------------------
  select id into ogbono_id
  from public.products
  where sku='M05-PAN-OGBONO' or lower(name) like '%ogbono%'
  order by case when sku='M05-PAN-OGBONO' then 0 else 1 end, id
  limit 1;

  if ogbono_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, is_active, in_season,
      sourcing_type, search_keywords, product_family, is_portioned, created_at, updated_at
    ) values (
      'Bush Mango Seeds (Ogbono)', 'Ogbono', 'BUSH-MANGO-SEEDS-OGBONO',
      'African bush mango seeds, commonly called Ogbono, sold through fixed weight options.',
      pantry_category_id, true, true, 'staple',
      'ogbono, bush mango seeds, african mango seeds, soup thickener',
      'Soup Ingredients', true, now(), now()
    ) returning id into ogbono_id;
  else
    update public.products
    set name='Bush Mango Seeds (Ogbono)',
        local_name='Ogbono',
        sku=coalesce(sku,'BUSH-MANGO-SEEDS-OGBONO'),
        description='African bush mango seeds, commonly called Ogbono, sold through fixed weight options.',
        category_id=pantry_category_id,
        is_active=true,
        in_season=true,
        sourcing_type='staple',
        search_keywords='ogbono, bush mango seeds, african mango seeds, soup thickener',
        product_family='Soup Ingredients',
        is_portioned=true,
        updated_at=now()
    where id=ogbono_id;
  end if;

  delete from public.product_variants where product_id=ogbono_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (ogbono_id,'100g','100g','pack',2789,10,'100g','kg',0.1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (ogbono_id,'1 Congo (0.86kg)','1 Congo (0.86kg)','pack',26969,10,'0.86kg','kg',0.86,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(ogbono_id,p_market_id,'Bush Mango Seeds (Ogbono)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  ---------------------------------------------------------------------------
  -- Kerewa Tomato (Yoruba Tomato)
  ---------------------------------------------------------------------------
  select id into kerewa_id from public.products where sku='KEREWA-TOMATO-YORUBA' limit 1;
  if kerewa_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,search_keywords,product_family,is_portioned,created_at,updated_at
    )
    select
      'Kerewa Tomato (Yoruba Tomato)','Yoruba Tomato / Kerewa','KEREWA-TOMATO-YORUBA',
      'Kerewa tomato, also sold locally as Yoruba tomato, offered through fixed weight and paint-bucket options.',
      vegetables_category_id,p.main_image_url,true,true,'fresh',
      'kerewa tomato, yoruba tomato, local tomato, fresh tomato','Fresh Tomato - Kerewa',true,now(),now()
    from public.products p where p.id=101
    returning id into kerewa_id;
  else
    update public.products
    set name='Kerewa Tomato (Yoruba Tomato)',local_name='Yoruba Tomato / Kerewa',
        description='Kerewa tomato, also sold locally as Yoruba tomato, offered through fixed weight and paint-bucket options.',
        category_id=vegetables_category_id,is_active=true,in_season=true,sourcing_type='fresh',
        search_keywords='kerewa tomato, yoruba tomato, local tomato, fresh tomato',
        product_family='Fresh Tomato - Kerewa',is_portioned=true,updated_at=now()
    where id=kerewa_id;
  end if;

  delete from public.product_variants where product_id=kerewa_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (kerewa_id,'500g','500g','pack',1149,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (kerewa_id,'1kg','1kg','pack',2199,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (kerewa_id,'Half Paint Bucket (1.5kg)','Half Paint Bucket (1.5kg)','pack',2899,10,'1.5kg','kg',1.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Paint Bucket'),
    (kerewa_id,'2kg','2kg','pack',4299,10,'2kg','kg',2,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (kerewa_id,'1 Paint Bucket (3kg)','1 Paint Bucket (3kg)','pack',5699,10,'3kg','kg',3,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(kerewa_id,p_market_id,'Kerewa Tomato (Yoruba Tomato)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  if tomato_source.id is not null and not exists(select 1 from public.product_images where product_id=kerewa_id) then
    insert into public.product_images(
      product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
      original_url,image_width,image_height,normalized_at
    ) values(
      kerewa_id,null,tomato_source.image_url,'Kerewa tomato',1,true,tomato_source.thumb_url,
      tomato_source.card_url,tomato_source.detail_url,tomato_source.original_url,
      tomato_source.image_width,tomato_source.image_height,tomato_source.normalized_at
    );
  end if;

  ---------------------------------------------------------------------------
  -- Fermented Locust Beans (Iru): Small Pack and Big Pack
  ---------------------------------------------------------------------------
  iru_small_id := 708;
  update public.products
  set name='Fermented Locust Beans (Iru) - Small Pack',
      local_name='Iru - Small Pack',
      sku='FERMENTED-LOCUST-BEANS-IRU-SMALL',
      description='Fermented African locust beans, locally called Iru, sold in small fixed packs.',
      category_id=spices_category_id,
      is_active=true,in_season=true,sourcing_type='staple',
      search_keywords='iru, locust beans, fermented locust beans, dawadawa, condiment',
      product_family='Fermented Locust Beans',is_portioned=false,updated_at=now()
  where id=iru_small_id;

  delete from public.product_variants where product_id=iru_small_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (iru_small_id,'1 Pack','1 Pack','pack',939,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (iru_small_id,'3 Packs','3 Packs','pack',2619,10,'3 packs','pack',3,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (iru_small_id,'Half Dozen (6 Packs)','Half Dozen (6 Packs)','pack',5139,10,'6 packs','pack',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (iru_small_id,'1 Dozen (12 Packs)','1 Dozen (12 Packs)','pack',10179,10,'12 packs','pack',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(iru_small_id,p_market_id,'Fermented Locust Beans (Iru) - Small Pack',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  select id into iru_big_id from public.products where sku='FERMENTED-LOCUST-BEANS-IRU-BIG' limit 1;
  if iru_big_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      search_keywords,product_family,is_portioned,created_at,updated_at
    )
    select
      'Fermented Locust Beans (Iru) - Big Pack','Iru - Big Pack','FERMENTED-LOCUST-BEANS-IRU-BIG',
      'Fermented African locust beans, locally called Iru, sold as a fixed big pack.',
      spices_category_id,p.main_image_url,true,true,'staple',
      'iru, locust beans, fermented locust beans, dawadawa, big pack',
      'Fermented Locust Beans',false,now(),now()
    from public.products p where p.id=iru_small_id
    returning id into iru_big_id;
  end if;

  delete from public.product_variants where product_id=iru_big_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (iru_big_id,'1 Big Pack','1 Big Pack','pack',2229,10,'1 big pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','Big Pack');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(iru_big_id,p_market_id,'Fermented Locust Beans (Iru) - Big Pack',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  if iru_source.id is not null and not exists(select 1 from public.product_images where product_id=iru_big_id) then
    insert into public.product_images(
      product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
      original_url,image_width,image_height,normalized_at
    ) values(
      iru_big_id,null,iru_source.image_url,'Fermented locust beans Iru big pack',1,true,
      iru_source.thumb_url,iru_source.card_url,iru_source.detail_url,iru_source.original_url,
      iru_source.image_width,iru_source.image_height,iru_source.normalized_at
    );
  end if;

  ---------------------------------------------------------------------------
  -- Black Peppercorns
  ---------------------------------------------------------------------------
  select id into black_pepper_id from public.products where sku='BLACK-PEPPERCORNS' limit 1;
  if black_pepper_id is null then
    insert into public.products(
      name,sku,description,category_id,is_active,in_season,sourcing_type,search_keywords,
      product_family,is_portioned,created_at,updated_at
    ) values(
      'Black Peppercorns','BLACK-PEPPERCORNS','Whole black peppercorns sold through fixed weight options.',
      spices_category_id,true,true,'staple','black pepper, peppercorns, whole black pepper, spice',
      'Whole Spices',true,now(),now()
    ) returning id into black_pepper_id;
  end if;

  delete from public.product_variants where product_id=black_pepper_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (black_pepper_id,'100g','100g','pack',3979,10,'100g','kg',0.1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (black_pepper_id,'250g','250g','pack',9789,10,'250g','kg',0.25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (black_pepper_id,'1kg','1kg','pack',38839,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null);

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(black_pepper_id,p_market_id,'Black Peppercorns',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  ---------------------------------------------------------------------------
  -- Thaumatococcus Leaves (Moi Moi Leaves)
  ---------------------------------------------------------------------------
  select id into moi_moi_leaf_id from public.products where sku='MOI-MOI-LEAVES' limit 1;
  if moi_moi_leaf_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      search_keywords,product_family,is_portioned,created_at,updated_at
    ) values(
      'Thaumatococcus Leaves (Moi Moi Leaves)','Moi Moi Leaves','MOI-MOI-LEAVES',
      'Fresh leaves traditionally used for wrapping and steaming Moi Moi, sold in fixed packs.',
      vegetables_category_id,true,true,'fresh','moi moi leaf, moin moin leaf, wrapping leaves, thaumatococcus',
      'Food Wrapping Leaves',false,now(),now()
    ) returning id into moi_moi_leaf_id;
  end if;

  delete from public.product_variants where product_id=moi_moi_leaf_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (moi_moi_leaf_id,'1 Pack','1 Pack','pack',979,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (moi_moi_leaf_id,'Half Dozen (6 Packs)','Half Dozen (6 Packs)','pack',5349,10,'6 packs','pack',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (moi_moi_leaf_id,'1 Dozen (12 Packs)','1 Dozen (12 Packs)','pack',10589,10,'12 packs','pack',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(moi_moi_leaf_id,p_market_id,'Thaumatococcus Leaves (Moi Moi Leaves)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  ---------------------------------------------------------------------------
  -- Papaya (Pawpaw), Unripe: Small / Medium / Big
  ---------------------------------------------------------------------------
  papaya_small_id := 15;
  update public.products
  set name='Papaya (Pawpaw) - Unripe (Small)',local_name='Unripe Pawpaw - Small',
      sku='PAPAYA-PAWPAW-UNRIPE-SMALL',
      description='Small unripe papaya, locally called pawpaw, sold through fixed piece-count options.',
      category_id=fruits_category_id,is_active=true,in_season=true,sourcing_type='fresh',
      search_keywords='papaya, pawpaw, unripe pawpaw, green papaya, small pawpaw',
      product_family='Unripe Papaya - Small',is_portioned=false,updated_at=now()
  where id=papaya_small_id;

  select id into papaya_medium_id from public.products where sku='PAPAYA-PAWPAW-UNRIPE-MEDIUM' limit 1;
  if papaya_medium_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      search_keywords,product_family,is_portioned,created_at,updated_at
    )
    select
      'Papaya (Pawpaw) - Unripe (Medium)','Unripe Pawpaw - Medium','PAPAYA-PAWPAW-UNRIPE-MEDIUM',
      'Medium unripe papaya, locally called pawpaw, sold through fixed piece-count options.',
      fruits_category_id,p.main_image_url,true,true,'fresh',
      'papaya, pawpaw, unripe pawpaw, green papaya, medium pawpaw',
      'Unripe Papaya - Medium',false,now(),now()
    from public.products p where p.id=papaya_small_id
    returning id into papaya_medium_id;
  end if;

  select id into papaya_big_id from public.products where sku='PAPAYA-PAWPAW-UNRIPE-BIG' limit 1;
  if papaya_big_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      search_keywords,product_family,is_portioned,created_at,updated_at
    )
    select
      'Papaya (Pawpaw) - Unripe (Big)','Unripe Pawpaw - Big','PAPAYA-PAWPAW-UNRIPE-BIG',
      'Big unripe papaya, locally called pawpaw, sold through fixed piece-count options.',
      fruits_category_id,p.main_image_url,true,true,'fresh',
      'papaya, pawpaw, unripe pawpaw, green papaya, big pawpaw',
      'Unripe Papaya - Big',false,now(),now()
    from public.products p where p.id=papaya_small_id
    returning id into papaya_big_id;
  end if;

  delete from public.product_variants where product_id in (papaya_small_id,papaya_medium_id,papaya_big_id);

  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (papaya_small_id,'1 Piece','1 Piece','pack',649,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (papaya_small_id,'Half Dozen','Half Dozen','pack',3399,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (papaya_small_id,'1 Dozen','1 Dozen','pack',6699,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen'),

    (papaya_medium_id,'1 Piece','1 Piece','pack',1229,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (papaya_medium_id,'Half Dozen','Half Dozen','pack',6789,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (papaya_medium_id,'1 Dozen','1 Dozen','pack',13299,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen'),

    (papaya_big_id,'1 Piece','1 Piece','pack',1519,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (papaya_big_id,'Half Dozen','Half Dozen','pack',8019,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (papaya_big_id,'1 Dozen','1 Dozen','pack',15939,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values
    (papaya_small_id,p_market_id,'Papaya (Pawpaw) - Unripe (Small)',true),
    (papaya_medium_id,p_market_id,'Papaya (Pawpaw) - Unripe (Medium)',true),
    (papaya_big_id,p_market_id,'Papaya (Pawpaw) - Unripe (Big)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  if papaya_source.id is not null then
    if not exists(select 1 from public.product_images where product_id=papaya_medium_id) then
      insert into public.product_images(
        product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
        original_url,image_width,image_height,normalized_at
      ) values(
        papaya_medium_id,null,papaya_source.image_url,'Medium unripe papaya pawpaw',1,true,
        papaya_source.thumb_url,papaya_source.card_url,papaya_source.detail_url,papaya_source.original_url,
        papaya_source.image_width,papaya_source.image_height,papaya_source.normalized_at
      );
    end if;

    if not exists(select 1 from public.product_images where product_id=papaya_big_id) then
      insert into public.product_images(
        product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
        original_url,image_width,image_height,normalized_at
      ) values(
        papaya_big_id,null,papaya_source.image_url,'Big unripe papaya pawpaw',1,true,
        papaya_source.thumb_url,papaya_source.card_url,papaya_source.detail_url,papaya_source.original_url,
        papaya_source.image_width,papaya_source.image_height,papaya_source.normalized_at
      );
    end if;
  end if;
end
$$;;
