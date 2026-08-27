do $$
declare
  p_market_id uuid := public.default_market_id();
  fish_category_id bigint;
  meat_category_id bigint;
  dairy_category_id bigint;
  vegetable_category_id bigint;
  kampala_id bigint;
  sawa_id bigint;
  catfish_medium_id bigint;
  catfish_small_id bigint;
  liver_id bigint;
  eggs_id bigint;
  cabbage_peeled_id bigint;
  cabbage_unpeeled_id bigint;
  green_pepper_id bigint;
  shoko_id bigint;
  source_image record;
begin
  select id into fish_category_id from public.product_categories where slug='fish-seafood' limit 1;
  select id into meat_category_id from public.product_categories where slug='meat-poultry' limit 1;
  select id into dairy_category_id from public.product_categories where slug='dairy-eggs' limit 1;
  select id into vegetable_category_id from public.product_categories where slug='vegetables' limit 1;

  if fish_category_id is null or meat_category_id is null or dairy_category_id is null or vegetable_category_id is null then
    raise exception 'One or more required product categories were not found';
  end if;

  -- Chub Mackerel (Kampala/Titus): reuse existing Titus product.
  select id into kampala_id
  from public.products
  where sku='CHUB-MACKEREL-KAMPALA-TITUS-20KG'
     or name='Mackerel (Titus)'
  order by case when sku='CHUB-MACKEREL-KAMPALA-TITUS-20KG' then 0 else 1 end, id
  limit 1;

  if kampala_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, is_active, in_season,
      sourcing_type, product_family, source_pack_quantity, source_pack_unit,
      is_portioned, search_keywords, created_at, updated_at
    ) values (
      'Chub Mackerel (Kampala/Titus)', 'Kampala Titus', 'CHUB-MACKEREL-KAMPALA-TITUS-20KG',
      'Chub mackerel sold through fixed weight and carton options.',
      fish_category_id, true, true, 'staple', 'Frozen Fish', 20, 'kg', true,
      'kampala titus, chub mackerel, titus fish, frozen fish', now(), now()
    ) returning id into kampala_id;
  else
    update public.products set
      name='Chub Mackerel (Kampala/Titus)',
      local_name='Kampala Titus',
      sku='CHUB-MACKEREL-KAMPALA-TITUS-20KG',
      description='Chub mackerel sold through fixed weight and carton options.',
      category_id=fish_category_id,
      is_active=true,
      in_season=true,
      sourcing_type='staple',
      product_family='Frozen Fish',
      source_pack_quantity=20,
      source_pack_unit='kg',
      is_portioned=true,
      search_keywords='kampala titus, chub mackerel, titus fish, frozen fish',
      updated_at=now()
    where id=kampala_id;
  end if;

  delete from public.product_variants where product_id=kampala_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (kampala_id,'1kg','1kg','pack',9229,0,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (kampala_id,'Quarter Carton (5kg)','Quarter Carton (5kg)','pack',24959,0,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (kampala_id,'Half Carton (10kg)','Half Carton (10kg)','pack',49319,0,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (kampala_id,'1 Carton (20kg)','1 Carton (20kg)','pack',97539,0,'20kg','kg',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Madeiran Sardinella (Sawa): correct existing Shawa/Herring record.
  select id into sawa_id
  from public.products
  where sku='MADEIRAN-SARDINELLA-SAWA-20KG'
     or name='Shawa (Herring)'
  order by case when sku='MADEIRAN-SARDINELLA-SAWA-20KG' then 0 else 1 end, id
  limit 1;

  if sawa_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, is_active, in_season,
      sourcing_type, product_family, source_pack_quantity, source_pack_unit,
      is_portioned, search_keywords, created_at, updated_at
    ) values (
      'Madeiran Sardinella (Sawa)', 'Sawa', 'MADEIRAN-SARDINELLA-SAWA-20KG',
      'Sawa fish sold through fixed weight and carton options.',
      fish_category_id, true, true, 'staple', 'Frozen Fish', 20, 'kg', true,
      'sawa fish, shawa fish, madeiran sardinella, frozen fish', now(), now()
    ) returning id into sawa_id;
  else
    update public.products set
      name='Madeiran Sardinella (Sawa)',
      local_name='Sawa',
      sku='MADEIRAN-SARDINELLA-SAWA-20KG',
      description='Sawa fish sold through fixed weight and carton options.',
      category_id=fish_category_id,
      is_active=true,
      in_season=true,
      sourcing_type='staple',
      product_family='Frozen Fish',
      source_pack_quantity=20,
      source_pack_unit='kg',
      is_portioned=true,
      search_keywords='sawa fish, shawa fish, madeiran sardinella, frozen fish',
      updated_at=now()
    where id=sawa_id;
  end if;

  delete from public.product_variants where product_id=sawa_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (sawa_id,'500g','500g','pack',2439,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (sawa_id,'1kg','1kg','pack',4279,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (sawa_id,'Quarter Carton (5kg)','Quarter Carton (5kg)','pack',18999,10,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (sawa_id,'Half Carton (10kg)','Half Carton (10kg)','pack',37399,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (sawa_id,'1 Carton (20kg)','1 Carton (20kg)','pack',73699,10,'20kg','kg',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Fresh processed catfish small; clone medium catfish image.
  select id into catfish_medium_id from public.products where sku='FRESH-PROCESSED-CATFISH-MEDIUM' limit 1;
  select id into catfish_small_id from public.products where sku='FRESH-PROCESSED-CATFISH-SMALL' limit 1;

  if catfish_small_id is null then
    insert into public.products (
      name, sku, description, category_id, main_image_url, is_active, in_season,
      sourcing_type, product_family, is_portioned, search_keywords, created_at, updated_at
    ) values (
      'Fresh Processed Catfish - Small', 'FRESH-PROCESSED-CATFISH-SMALL',
      'Small fresh catfish, cleaned and processed, sold through fixed piece-count options.',
      fish_category_id,
      (select main_image_url from public.products where id=catfish_medium_id),
      true,true,'fresh','Fresh Catfish',false,
      'fresh catfish, processed catfish, small catfish',now(),now()
    ) returning id into catfish_small_id;
  else
    update public.products set
      name='Fresh Processed Catfish - Small',
      description='Small fresh catfish, cleaned and processed, sold through fixed piece-count options.',
      category_id=fish_category_id,
      main_image_url=coalesce(main_image_url,(select main_image_url from public.products where id=catfish_medium_id)),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Fresh Catfish',
      is_portioned=false,search_keywords='fresh catfish, processed catfish, small catfish',updated_at=now()
    where id=catfish_small_id;
  end if;

  delete from public.product_variants where product_id=catfish_small_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (catfish_small_id,'1 Piece','1 Piece','pack',3479,10,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (catfish_small_id,'Half Dozen','Half Dozen','pack',17849,10,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (catfish_small_id,'1 Dozen','1 Dozen','pack',35099,10,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  if catfish_medium_id is not null and not exists (select 1 from public.product_images where product_id=catfish_small_id) then
    select * into source_image from public.product_images where product_id=catfish_medium_id order by is_primary desc, position, id limit 1;
    if source_image.id is not null then
      insert into public.product_images (
        product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
        original_url,image_width,image_height,normalized_at
      ) values (
        catfish_small_id,null,source_image.image_url,'Fresh processed catfish - small',1,true,
        source_image.thumb_url,source_image.card_url,source_image.detail_url,source_image.original_url,
        source_image.image_width,source_image.image_height,source_image.normalized_at
      );
    end if;
  end if;

  -- Beef liver (cow liver), out of stock.
  select id into liver_id from public.products where name='Beef Liver' or sku='BEEF-LIVER' order by id limit 1;
  if liver_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Beef Liver','Cow Liver','BEEF-LIVER','Fresh beef liver sold through fixed weight options.',
      meat_category_id,true,true,'fresh','Beef Offal',true,'beef liver, cow liver, offal',now(),now()
    ) returning id into liver_id;
  else
    update public.products set
      name='Beef Liver',local_name='Cow Liver',sku='BEEF-LIVER',
      description='Fresh beef liver sold through fixed weight options.',category_id=meat_category_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Beef Offal',
      is_portioned=true,search_keywords='beef liver, cow liver, offal',updated_at=now()
    where id=liver_id;
  end if;

  delete from public.product_variants where product_id=liver_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (liver_id,'500g','500g','pack',4849,0,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (liver_id,'1kg','1kg','pack',9099,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Chicken eggs, fixed options only and out of stock.
  select id into eggs_id from public.products where name='Chicken Eggs' or sku='CHICKEN-EGGS' order by id limit 1;
  if eggs_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Chicken Eggs','Eggs','CHICKEN-EGGS','Chicken eggs sold through fixed piece and crate options.',
      dairy_category_id,true,true,'staple','Eggs',false,'chicken eggs, eggs, crate of eggs',now(),now()
    ) returning id into eggs_id;
  else
    update public.products set
      name='Chicken Eggs',local_name='Eggs',sku='CHICKEN-EGGS',
      description='Chicken eggs sold through fixed piece and crate options.',category_id=dairy_category_id,
      is_active=true,in_season=true,sourcing_type='staple',product_family='Eggs',
      is_portioned=false,search_keywords='chicken eggs, eggs, crate of eggs',updated_at=now()
    where id=eggs_id;
  end if;

  delete from public.product_variants where product_id=eggs_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (eggs_id,'1 Piece','1 Piece','pack',329,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (eggs_id,'1 Pack (6 Pieces)','1 Pack (6 Pieces)','pack',1459,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Pack'),
    (eggs_id,'Half Crate (15 Pieces)','Half Crate (15 Pieces)','pack',3319,0,'15 pieces','piece',15,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Crate'),
    (eggs_id,'1 Crate (30 Pieces)','1 Crate (30 Pieces)','pack',6879,0,'30 pieces','piece',30,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Crate');

  -- Reuse existing cabbage product as peeled Jos cabbage.
  select id into cabbage_peeled_id
  from public.products
  where sku='JOS-CABBAGE-PEELED-50KG' or name='Cabbage'
  order by case when sku='JOS-CABBAGE-PEELED-50KG' then 0 else 1 end, id
  limit 1;

  if cabbage_peeled_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Jos Cabbage - Peeled','Cabbage (Jos) - Peeled','JOS-CABBAGE-PEELED-50KG',
      'Jos cabbage with outer leaves removed, sold through fixed weight options.',
      vegetable_category_id,true,true,'fresh','Cabbage',50,'kg',true,
      'jos cabbage, peeled cabbage, cabbage',now(),now()
    ) returning id into cabbage_peeled_id;
  else
    update public.products set
      name='Jos Cabbage - Peeled',local_name='Cabbage (Jos) - Peeled',sku='JOS-CABBAGE-PEELED-50KG',
      description='Jos cabbage with outer leaves removed, sold through fixed weight options.',
      category_id=vegetable_category_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Cabbage',source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,
      search_keywords='jos cabbage, peeled cabbage, cabbage',updated_at=now()
    where id=cabbage_peeled_id;
  end if;

  delete from public.product_variants where product_id=cabbage_peeled_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (cabbage_peeled_id,'500g','500g','pack',979,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (cabbage_peeled_id,'1kg','1kg','pack',1859,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (cabbage_peeled_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',15069,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (cabbage_peeled_id,'Half Bag (25kg)','Half Bag (25kg)','pack',30029,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (cabbage_peeled_id,'1 Bag (50kg)','1 Bag (50kg)','pack',59889,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Create/update unpeeled Jos cabbage and clone cabbage image.
  select id into cabbage_unpeeled_id from public.products where sku='JOS-CABBAGE-UNPEELED-50KG' limit 1;
  if cabbage_unpeeled_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Jos Cabbage - Unpeeled','Cabbage (Jos) - Unpeeled','JOS-CABBAGE-UNPEELED-50KG',
      'Whole Jos cabbage with outer leaves intact, sold through fixed weight options.',
      vegetable_category_id,(select main_image_url from public.products where id=cabbage_peeled_id),
      true,true,'fresh','Cabbage',50,'kg',true,'jos cabbage, unpeeled cabbage, cabbage',now(),now()
    ) returning id into cabbage_unpeeled_id;
  else
    update public.products set
      name='Jos Cabbage - Unpeeled',local_name='Cabbage (Jos) - Unpeeled',
      description='Whole Jos cabbage with outer leaves intact, sold through fixed weight options.',
      category_id=vegetable_category_id,
      main_image_url=coalesce(main_image_url,(select main_image_url from public.products where id=cabbage_peeled_id)),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Cabbage',
      source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,
      search_keywords='jos cabbage, unpeeled cabbage, cabbage',updated_at=now()
    where id=cabbage_unpeeled_id;
  end if;

  delete from public.product_variants where product_id=cabbage_unpeeled_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (cabbage_unpeeled_id,'500g','500g','pack',889,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (cabbage_unpeeled_id,'1kg','1kg','pack',1689,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (cabbage_unpeeled_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',13869,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (cabbage_unpeeled_id,'Half Bag (25kg)','Half Bag (25kg)','pack',27639,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (cabbage_unpeeled_id,'1 Bag (50kg)','1 Bag (50kg)','pack',55089,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  if not exists (select 1 from public.product_images where product_id=cabbage_unpeeled_id) then
    select * into source_image from public.product_images where product_id=cabbage_peeled_id order by is_primary desc, position, id limit 1;
    if source_image.id is not null then
      insert into public.product_images (
        product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,
        original_url,image_width,image_height,normalized_at
      ) values (
        cabbage_unpeeled_id,null,source_image.image_url,'Jos cabbage - unpeeled',1,true,
        source_image.thumb_url,source_image.card_url,source_image.detail_url,source_image.original_url,
        source_image.image_width,source_image.image_height,source_image.normalized_at
      );
    end if;
  end if;

  -- Green bell pepper.
  select id into green_pepper_id from public.products where sku='GREEN-BELL-PEPPER' limit 1;
  if green_pepper_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Green Bell Pepper','Green Pepper','GREEN-BELL-PEPPER',
      'Fresh green bell pepper sold through fixed weight options.',
      vegetable_category_id,true,true,'fresh','Bell Pepper',true,
      'green bell pepper, green pepper, sweet pepper',now(),now()
    ) returning id into green_pepper_id;
  else
    update public.products set
      name='Green Bell Pepper',local_name='Green Pepper',description='Fresh green bell pepper sold through fixed weight options.',
      category_id=vegetable_category_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Bell Pepper',is_portioned=true,
      search_keywords='green bell pepper, green pepper, sweet pepper',updated_at=now()
    where id=green_pepper_id;
  end if;

  delete from public.product_variants where product_id=green_pepper_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (green_pepper_id,'500g','500g','pack',5769,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (green_pepper_id,'1kg','1kg','pack',11429,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Lagos spinach / Efo Shoko - Toko.
  select id into shoko_id from public.products where sku='LAGOS-SPINACH-EFO-SHOKO-TOKO' limit 1;
  if shoko_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,search_keywords,created_at,updated_at
    ) values (
      'Lagos Spinach (Efo Shoko) - Toko','Efo Shoko - Toko','LAGOS-SPINACH-EFO-SHOKO-TOKO',
      'Fresh Lagos spinach sold through fixed bunch-count options.',
      vegetable_category_id,true,true,'fresh','Leafy Vegetables',false,
      'lagos spinach, efo shoko, shokoyokoto, toko, celosia',now(),now()
    ) returning id into shoko_id;
  else
    update public.products set
      name='Lagos Spinach (Efo Shoko) - Toko',local_name='Efo Shoko - Toko',
      description='Fresh Lagos spinach sold through fixed bunch-count options.',
      category_id=vegetable_category_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Leafy Vegetables',is_portioned=false,
      search_keywords='lagos spinach, efo shoko, shokoyokoto, toko, celosia',updated_at=now()
    where id=shoko_id;
  end if;

  delete from public.product_variants where product_id=shoko_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (shoko_id,'1 Bunch','1 Bunch','pack',679,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (shoko_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',3549,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (shoko_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',6999,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  -- Ensure all products are listed in the default market.
  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (kampala_id,p_market_id,'Kampala Titus',true),
    (sawa_id,p_market_id,'Sawa',true),
    (catfish_small_id,p_market_id,'Fresh Processed Catfish - Small',true),
    (liver_id,p_market_id,'Cow Liver',true),
    (eggs_id,p_market_id,'Eggs',true),
    (cabbage_peeled_id,p_market_id,'Cabbage (Jos) - Peeled',true),
    (cabbage_unpeeled_id,p_market_id,'Cabbage (Jos) - Unpeeled',true),
    (green_pepper_id,p_market_id,'Green Pepper',true),
    (shoko_id,p_market_id,'Efo Shoko - Toko',true)
  on conflict (product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;
end
$$;;
