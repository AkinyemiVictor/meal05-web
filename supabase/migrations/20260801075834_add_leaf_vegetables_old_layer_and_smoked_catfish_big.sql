do $$
declare
  p_market_id uuid := public.default_market_id();
  veg_category_id bigint;
  meat_category_id bigint;
  fish_category_id bigint;

  goat_head_id bigint;
  tete_id bigint;
  okra_id bigint;
  waterleaf_id bigint;
  smoked_medium_id bigint;

  old_layer_id bigint;
  uziza_id bigint;
  ewedu_id bigint;
  okazi_id bigint;
  lettuce_id bigint;
  smoked_big_id bigint;

  source_image record;
  ewedu_url text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ewedu%20(Jute%20Leaf).png';
begin
  select id into veg_category_id from public.product_categories where slug='vegetables' limit 1;
  select id into meat_category_id from public.product_categories where slug='meat-poultry' limit 1;
  select id into fish_category_id from public.product_categories where slug='fish-seafood' limit 1;

  if veg_category_id is null or meat_category_id is null or fish_category_id is null then
    raise exception 'Required catalogue categories were not found';
  end if;

  -- Goat head: whole per head only; remove any attribute selectors such as form/cutting.
  select id into goat_head_id
  from public.products
  where sku='GOAT-HEAD-PER-HEAD' or name='Goat Head'
  order by case when sku='GOAT-HEAD-PER-HEAD' then 0 else 1 end, id
  limit 1;

  if goat_head_id is not null then
    update public.products
    set description='Whole goat head sold per head. No cutting or processing option is provided.',
        product_family='Goat Offal',
        updated_at=now()
    where id=goat_head_id;

    delete from public.product_attributes where product_id=goat_head_id;

    update public.product_variants
    set unit='head',
        name='1 Head',
        display_label='1 Head',
        size='1 head',
        base_unit='head',
        base_quantity=1,
        purchase_mode='fixed',
        min_quantity=1,
        max_quantity=null,
        step_quantity=1,
        is_default=true,
        is_active=true
    where product_id=goat_head_id;
  end if;

  -- Existing products to update.
  select id into tete_id from public.products where id=109 or lower(name) like '%african spinach%' order by case when id=109 then 0 else 1 end limit 1;
  select id into okra_id from public.products where id=107 or lower(name)='okra' order by case when id=107 then 0 else 1 end limit 1;
  select id into waterleaf_id from public.products where id=104 or lower(replace(name,' ',''))='waterleaf' order by case when id=104 then 0 else 1 end limit 1;
  select id into smoked_medium_id from public.products where sku='SMOKED-FARMED-CATFISH-MEDIUM' limit 1;

  if tete_id is null or okra_id is null or waterleaf_id is null or smoked_medium_id is null then
    raise exception 'One or more existing source products were not found';
  end if;

  update public.products
  set name='African Spinach (Efo Tete)',
      local_name='Efo Tete',
      sku='AFRICAN-SPINACH-EFO-TETE',
      description='Fresh African spinach, locally known as Efo Tete, sold in fixed bunch-count options.',
      category_id=veg_category_id,
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      product_family='Leafy Vegetables',
      is_portioned=false,
      updated_at=now()
  where id=tete_id;

  update public.products
  set name='Okra',
      local_name='Okro',
      sku='FRESH-OKRA-10KG',
      description='Fresh okra, locally called okro, sold through fixed weight options.',
      category_id=veg_category_id,
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      product_family='Fresh Vegetables',
      source_pack_quantity=10,
      source_pack_unit='kg',
      is_portioned=true,
      updated_at=now()
  where id=okra_id;

  update public.products
  set name='Waterleaf (Surinam Spinach)',
      local_name='Waterleaf',
      sku='WATERLEAF-SURINAM-SPINACH',
      description='Fresh waterleaf, also known as Surinam spinach, sold in fixed bunch-count options.',
      category_id=veg_category_id,
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      product_family='Leafy Vegetables',
      is_portioned=false,
      updated_at=now()
  where id=waterleaf_id;

  delete from public.product_variants where product_id in (tete_id, okra_id, waterleaf_id);

  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (tete_id,'1 Bunch','1 Bunch','bunch',889,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (tete_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',4829,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (tete_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',9549,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen'),

    (okra_id,'500g','500g','pack',729,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (okra_id,'1kg','1kg','pack',1349,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (okra_id,'5kg','5kg','pack',6349,10,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (okra_id,'10kg','10kg','pack',12589,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),

    (waterleaf_id,'1 Bunch','1 Bunch','bunch',349,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (waterleaf_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',1599,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (waterleaf_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',2809,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values
    (tete_id,p_market_id,'African Spinach (Efo Tete)',true),
    (okra_id,p_market_id,'Okra (Okro)',true),
    (waterleaf_id,p_market_id,'Waterleaf (Surinam Spinach)',true)
  on conflict(product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;

  -- Processed spent-layer chicken (old layer).
  select id into old_layer_id from public.products where sku='PROCESSED-SPENT-LAYER-CHICKEN' limit 1;
  if old_layer_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    ) values (
      'Processed Spent Layer Chicken','Chicken - Old Layer (Processed)','PROCESSED-SPENT-LAYER-CHICKEN',
      'A whole processed spent-layer chicken, commonly called old layer chicken, sold per bird.',
      meat_category_id,null,true,true,'fresh','Whole Chicken',false,now(),now()
    ) returning id into old_layer_id;
  else
    update public.products
    set name='Processed Spent Layer Chicken',local_name='Chicken - Old Layer (Processed)',
        description='A whole processed spent-layer chicken, commonly called old layer chicken, sold per bird.',
        category_id=meat_category_id,is_active=true,in_season=true,sourcing_type='fresh',
        product_family='Whole Chicken',is_portioned=false,updated_at=now()
    where id=old_layer_id;
  end if;

  delete from public.product_variants where product_id=old_layer_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values (
    old_layer_id,'1 Whole Chicken','1 Whole Chicken','bird',14509,10,'1 whole chicken','bird',1,
    true,true,p_market_id,'NGN','fixed',1,null,1,'standard'
  );
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(old_layer_id,p_market_id,'Chicken - Old Layer (Processed)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- Uziza leaves.
  select id into uziza_id from public.products where sku='UZIZA-LEAVES' limit 1;
  if uziza_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Uziza Leaves','Uziza Leaves','UZIZA-LEAVES',
      'Fresh uziza leaves sold in fixed bunch-count options.',veg_category_id,true,true,'fresh',
      'Leafy Vegetables',false,now(),now()
    ) returning id into uziza_id;
  end if;
  delete from public.product_variants where product_id=uziza_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (uziza_id,'1 Bunch','1 Bunch','bunch',729,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (uziza_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',3509,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (uziza_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',6909,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(uziza_id,p_market_id,'Uziza Leaves',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- Jute leaves (Ewedu).
  select id into ewedu_id from public.products where sku='JUTE-LEAVES-EWEDU' limit 1;
  if ewedu_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    ) values (
      'Jute Leaves (Ewedu)','Ewedu','JUTE-LEAVES-EWEDU',
      'Fresh jute leaves, locally known as ewedu, sold in fixed bunch-count options.',
      veg_category_id,ewedu_url,true,true,'fresh','Leafy Vegetables',false,now(),now()
    ) returning id into ewedu_id;
  else
    update public.products set main_image_url=coalesce(main_image_url,ewedu_url),updated_at=now() where id=ewedu_id;
  end if;
  delete from public.product_variants where product_id=ewedu_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (ewedu_id,'1 Bunch','1 Bunch','bunch',979,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (ewedu_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',4869,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (ewedu_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',9639,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(ewedu_id,p_market_id,'Jute Leaves (Ewedu)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
  if not exists(select 1 from public.product_images where product_id=ewedu_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url)
    values(ewedu_id,null,ewedu_url,'Jute Leaves (Ewedu)',1,true,ewedu_url,ewedu_url,ewedu_url,ewedu_url);
  end if;

  -- Okazi leaves.
  select id into okazi_id from public.products where sku='OKAZI-LEAVES' limit 1;
  if okazi_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Okazi Leaves','Okazi','OKAZI-LEAVES',
      'Fresh okazi leaves sold in fixed bunch-count options.',veg_category_id,true,true,'fresh',
      'Leafy Vegetables',false,now(),now()
    ) returning id into okazi_id;
  end if;
  delete from public.product_variants where product_id=okazi_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (okazi_id,'1 Bunch','1 Bunch','bunch',649,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (okazi_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',3349,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (okazi_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',6599,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(okazi_id,p_market_id,'Okazi Leaves',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- Lettuce.
  select id into lettuce_id from public.products where sku='LETTUCE-PACK' limit 1;
  if lettuce_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Lettuce','Lettuce (Pack)','LETTUCE-PACK',
      'Fresh lettuce sold in fixed pack-count options.',veg_category_id,true,true,'fresh',
      'Leafy Vegetables',false,now(),now()
    ) returning id into lettuce_id;
  end if;
  delete from public.product_variants where product_id=lettuce_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (lettuce_id,'1 Pack','1 Pack','pack',869,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (lettuce_id,'3 Packs','3 Packs','pack',2409,10,'3 packs','pack',3,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (lettuce_id,'6 Packs','6 Packs','pack',4719,10,'6 packs','pack',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (lettuce_id,'12 Packs','12 Packs','pack',9339,10,'12 packs','pack',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(lettuce_id,p_market_id,'Lettuce (Pack)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  -- Smoked farmed catfish, big size.
  select id into smoked_big_id from public.products where sku='SMOKED-FARMED-CATFISH-BIG' limit 1;
  if smoked_big_id is null then
    insert into public.products(
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    )
    select
      'Smoked Farmed Catfish - Big','Smoked Catfish - Agric (Big)','SMOKED-FARMED-CATFISH-BIG',
      'Big-sized smoked farmed catfish sold through fixed piece-count options.',
      fish_category_id,main_image_url,true,true,'fresh','Smoked Fish',false,now(),now()
    from public.products where id=smoked_medium_id
    returning id into smoked_big_id;
  end if;
  delete from public.product_variants where product_id=smoked_big_id;
  insert into public.product_variants(
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (smoked_big_id,'1 Piece','1 Piece','pack',3549,10,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (smoked_big_id,'5 Pieces','5 Pieces','pack',17349,10,'5 pieces','piece',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (smoked_big_id,'10 Pieces','10 Pieces','pack',31709,10,'10 pieces','piece',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (smoked_big_id,'20 Pieces','20 Pieces','pack',63329,10,'20 pieces','piece',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values(smoked_big_id,p_market_id,'Smoked Catfish - Agric (Big)',true)
  on conflict(product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  select * into source_image from public.product_images
  where product_id=smoked_medium_id
  order by is_primary desc,position,id limit 1;
  if source_image.id is not null and not exists(select 1 from public.product_images where product_id=smoked_big_id) then
    insert into public.product_images(
      product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,
      detail_url,original_url,image_width,image_height,normalized_at
    ) values (
      smoked_big_id,null,source_image.image_url,'Smoked Farmed Catfish - Big',1,true,
      source_image.thumb_url,source_image.card_url,source_image.detail_url,source_image.original_url,
      source_image.image_width,source_image.image_height,source_image.normalized_at
    );
  end if;
end
$$;;
