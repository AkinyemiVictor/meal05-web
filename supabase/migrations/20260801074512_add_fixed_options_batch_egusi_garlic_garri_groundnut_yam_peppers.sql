do $$
declare
  p_market_id uuid := public.default_market_id();
  p_id bigint;
  source_product_id bigint;
  source_image record;
  fruits_category bigint;
  grains_category bigint;
  tubers_category bigint;
  spices_category bigint;
  pantry_category bigint;
begin
  select id into fruits_category from public.product_categories where slug='fruits' limit 1;
  select id into grains_category from public.product_categories where slug='grains-cereals' limit 1;
  select id into tubers_category from public.product_categories where slug='tubers-legumes' limit 1;
  select id into spices_category from public.product_categories where slug='spices-condiments' limit 1;
  select id into pantry_category from public.product_categories where slug='pantry-processed-foods' limit 1;

  -- 1. Hand-Peeled Melon Seeds (Egusi)
  select id into p_id from public.products where id=882 or sku='M05-PAN-EGUSI' order by case when id=882 then 0 else 1 end limit 1;
  if p_id is null then raise exception 'Egusi product not found'; end if;
  update public.products set
    name='Hand-Peeled Melon Seeds (Egusi)',
    local_name='Egusi - Hand Peeled',
    sku='M05-PAN-EGUSI-HAND-PEELED',
    description='Hand-peeled melon seeds (egusi) sold through fixed local-measurement options.',
    category_id=pantry_category,
    product_family='Soup Ingredients',
    source_pack_quantity=0.9,
    source_pack_unit='kg',
    is_portioned=true,
    sourcing_type='staple',
    is_active=true,
    in_season=true,
    updated_at=now()
  where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'1 Cup (100g)','1 Cup (100g)','pack',689,null,10,'100g','kg',0.1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Cup'),
    (p_id,'Half Congo (450g)','Half Congo (450g)','pack',2979,null,10,'450g','kg',0.45,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (p_id,'1 Congo (900g)','1 Congo (900g)','pack',5849,null,10,'900g','kg',0.9,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Hand-Peeled Melon Seeds (Egusi)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- 2. Chinese Garlic
  select id into p_id from public.products where id=711 or sku='CHINESE-GARLIC-1KG' order by case when id=711 then 0 else 1 end limit 1;
  if p_id is null then raise exception 'Garlic product not found'; end if;
  update public.products set
    name='Chinese Garlic',
    local_name='Garlic - Chinese',
    sku='CHINESE-GARLIC-1KG',
    description='Chinese garlic sold through fixed piece and pack options.',
    category_id=spices_category,
    product_family='Fresh Aromatics',
    source_pack_quantity=1,
    source_pack_unit='kg',
    is_portioned=true,
    sourcing_type='fresh',
    is_active=true,
    in_season=true,
    updated_at=now()
  where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'1 Piece','1 Piece','pack',679,null,10,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (p_id,'Half Pack (500g)','Half Pack (500g)','pack',4149,null,10,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Pack'),
    (p_id,'1 Pack (1kg)','1 Pack (1kg)','pack',8199,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Pack');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Chinese Garlic',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- 3. Premium White Garri (Ilora), using the existing White Garri storage asset.
  select id into p_id from public.products where sku='WHITE-GARRI-ILORA-PREMIUM-50KG' limit 1;
  if p_id is null then
    insert into public.products
      (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values
      ('Premium White Garri (Ilora)','Ilora White Garri - Premium','WHITE-GARRI-ILORA-PREMIUM-50KG','Premium white garri from Ilora sold through fixed local-measurement and bag-size options.',grains_category,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/White%20Garri.png',true,true,'staple','White Garri',50,'kg',true,now(),now())
    returning id into p_id;
  else
    update public.products set
      name='Premium White Garri (Ilora)',local_name='Ilora White Garri - Premium',
      description='Premium white garri from Ilora sold through fixed local-measurement and bag-size options.',
      category_id=grains_category,main_image_url='https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/White%20Garri.png',
      is_active=true,in_season=true,sourcing_type='staple',product_family='White Garri',
      source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=p_id;
  end if;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'300g','300g','pack',229,null,10,'300g','kg',0.3,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (p_id,'1 Congo (1kg)','1 Congo (1kg)','pack',509,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (p_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',5439,null,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (p_id,'Half Bag (25kg)','Half Bag (25kg)','pack',10779,null,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (p_id,'1 Bag (50kg)','1 Bag (50kg)','pack',21449,null,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Premium White Garri (Ilora)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
  if not exists(select 1 from public.product_images where product_id=p_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,original_url)
    values(p_id,null,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/White%20Garri.png','Premium White Garri (Ilora)',1,true,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/White%20Garri.png');
  end if;

  -- 4. Raw Shelled Groundnuts
  select id into p_id from public.products where id=606 or sku='RAW-SHELLED-GROUNDNUT-800G' order by case when id=606 then 0 else 1 end limit 1;
  if p_id is null then raise exception 'Groundnut product not found'; end if;
  update public.products set
    name='Raw Shelled Groundnuts',
    local_name='Shelled Groundnut - Uncooked',
    sku='RAW-SHELLED-GROUNDNUT-800G',
    description='Raw uncooked groundnut kernels with the shells removed, sold through fixed Congo portions.',
    category_id=tubers_category,
    product_family='Groundnuts',
    source_pack_quantity=0.8,
    source_pack_unit='kg',
    is_portioned=true,
    sourcing_type='staple',
    is_active=true,
    in_season=true,
    updated_at=now()
  where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'Half Congo (400g)','Half Congo (400g)','pack',649,null,10,'400g','kg',0.4,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (p_id,'1 Congo (800g)','1 Congo (800g)','pack',1189,null,10,'800g','kg',0.8,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Raw Shelled Groundnuts',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- 5. White Yam (Mumuyi) - Small
  select id into p_id from public.products where sku='WHITE-YAM-MUMUYI-SMALL' limit 1;
  if p_id is null then
    insert into public.products
      (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    select 'White Yam (Mumuyi) - Small','Yam - Mumuyi (Small)','WHITE-YAM-MUMUYI-SMALL',
      'Small-size Mumuyi white yam sold through fixed tuber-count options.',tubers_category,main_image_url,true,true,'fresh','White Yam - Mumuyi',false,now(),now()
    from public.products where id=601
    returning id into p_id;
  end if;
  update public.products set name='White Yam (Mumuyi) - Small',local_name='Yam - Mumuyi (Small)',category_id=tubers_category,is_active=true,in_season=true,sourcing_type='fresh',product_family='White Yam - Mumuyi',is_portioned=false,updated_at=now() where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (p_id,'3 Tubers','3 Tubers','pack',7629,null,10,'3 tubers','tuber',3,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (p_id,'10 Tubers','10 Tubers','pack',26797,null,10,'10 tubers','tuber',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'White Yam (Mumuyi) - Small',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
  if not exists(select 1 from public.product_images where product_id=p_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select p_id,null,image_url,'White Yam (Mumuyi) - Small',position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=601;
  end if;

  -- 6. White Yam (Mumuyi) - Big
  select id into p_id from public.products where sku='WHITE-YAM-MUMUYI-BIG' limit 1;
  if p_id is null then
    insert into public.products
      (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    select 'White Yam (Mumuyi) - Big','Yam - Mumuyi (Big)','WHITE-YAM-MUMUYI-BIG',
      'Big-size Mumuyi white yam sold through fixed tuber-count options.',tubers_category,main_image_url,true,true,'fresh','White Yam - Mumuyi',false,now(),now()
    from public.products where id=601
    returning id into p_id;
  end if;
  update public.products set name='White Yam (Mumuyi) - Big',local_name='Yam - Mumuyi (Big)',category_id=tubers_category,is_active=true,in_season=true,sourcing_type='fresh',product_family='White Yam - Mumuyi',is_portioned=false,updated_at=now() where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (p_id,'3 Tubers','3 Tubers','pack',10849,null,10,'3 tubers','tuber',3,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (p_id,'10 Tubers','10 Tubers','pack',37729,null,10,'10 tubers','tuber',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'White Yam (Mumuyi) - Big',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
  if not exists(select 1 from public.product_images where product_id=p_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select p_id,null,image_url,'White Yam (Mumuyi) - Big',position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=601;
  end if;

  -- 7. Egba Garri
  select id into p_id from public.products where id=412 or sku='GARRI-EGBA-50KG' order by case when id=412 then 0 else 1 end limit 1;
  if p_id is null then raise exception 'Egba Garri product not found'; end if;
  update public.products set
    name='Egba Garri',
    local_name='Garri - Egba',
    sku='GARRI-EGBA-50KG',
    description='Egba garri sold through fixed Congo and bag-size options.',
    category_id=grains_category,
    product_family='White Garri',
    source_pack_quantity=50,
    source_pack_unit='kg',
    is_portioned=true,
    sourcing_type='staple',
    is_active=true,
    in_season=true,
    updated_at=now()
  where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'1 Congo (1kg)','1 Congo (1kg)','pack',1509,null,10,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (p_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',16119,null,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (p_id,'Half Bag (25kg)','Half Bag (25kg)','pack',32129,null,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (p_id,'1 Bag (50kg)','1 Bag (50kg)','pack',64149,null,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Egba Garri',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- 8. Dried Bird Pepper (Ata Ijosi)
  select id into p_id from public.products where id=114 or sku='DRIED-BIRD-PEPPER-ATA-IJOSI-1KG' order by case when id=114 then 0 else 1 end limit 1;
  if p_id is null then raise exception 'Dried pepper product not found'; end if;
  update public.products set
    name='Dried Bird Pepper (Ata Ijosi)',
    local_name='Dry Pepper - Ata Ijosi',
    sku='DRIED-BIRD-PEPPER-ATA-IJOSI-1KG',
    description='Dried Nigerian bird pepper (Ata Ijosi) sold through fixed cup, Congo and paint-bucket options.',
    category_id=spices_category,
    product_family='Dried Chili Pepper',
    source_pack_quantity=1,
    source_pack_unit='kg',
    is_portioned=true,
    sourcing_type='staple',
    is_active=true,
    in_season=true,
    updated_at=now()
  where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'1 Cup (60g)','1 Cup (60g)','pack',889,null,10,'60g','kg',0.06,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Cup'),
    (p_id,'1 Congo (600g)','1 Congo (600g)','pack',5689,null,10,'600g','kg',0.6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (p_id,'1 Paint Bucket (1kg)','1 Paint Bucket (1kg)','pack',13309,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Dried Bird Pepper (Ata Ijosi)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- 9. Dried Chili Pepper (Ata Gbigbe)
  select id into p_id from public.products where sku='DRIED-CHILI-PEPPER-ATA-GBIGBE-600G' limit 1;
  if p_id is null then
    insert into public.products
      (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    select 'Dried Chili Pepper (Ata Gbigbe)','Dry Chili Pepper - Atagbigbe','DRIED-CHILI-PEPPER-ATA-GBIGBE-600G',
      'Dried chili pepper (Ata Gbigbe) sold through fixed cup, Congo and paint-bucket options.',spices_category,main_image_url,true,true,'staple','Dried Chili Pepper',0.6,'kg',true,now(),now()
    from public.products where id=114
    returning id into p_id;
  end if;
  update public.products set name='Dried Chili Pepper (Ata Gbigbe)',local_name='Dry Chili Pepper - Atagbigbe',category_id=spices_category,is_active=true,in_season=true,sourcing_type='staple',product_family='Dried Chili Pepper',source_pack_quantity=0.6,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=p_id;
  delete from public.product_variants where product_id=p_id;
  insert into public.product_variants
    (product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (p_id,'1 Cup (40g)','1 Cup (40g)','pack',619,null,10,'40g','kg',0.04,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Cup'),
    (p_id,'1 Congo (400g)','1 Congo (400g)','pack',4649,null,10,'400g','kg',0.4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (p_id,'1 Paint Bucket (600g)','1 Paint Bucket (600g)','pack',7899,null,10,'600g','kg',0.6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(p_id,p_market_id,'Dried Chili Pepper (Ata Gbigbe)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
  if not exists(select 1 from public.product_images where product_id=p_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select p_id,null,image_url,'Dried Chili Pepper (Ata Gbigbe)',position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=114;
  end if;
end
$$;;
