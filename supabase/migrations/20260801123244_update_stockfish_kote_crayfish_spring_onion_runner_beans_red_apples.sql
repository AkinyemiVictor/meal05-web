do $$
declare
  p_market_id uuid := public.default_market_id();
  fish_category_id bigint;
  vegetable_category_id bigint;
  fruit_category_id bigint;
  stockfish_id bigint;
  kote_id bigint;
  crayfish_id bigint;
  spring_onion_id bigint;
  runner_beans_id bigint;
  red_apple_id bigint;
  runner_image_url text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Green%20Beans.png';
begin
  select id into fish_category_id from public.product_categories where name='Fish & Seafood' limit 1;
  select id into vegetable_category_id from public.product_categories where name='Vegetables' limit 1;
  select id into fruit_category_id from public.product_categories where name='Fruits' limit 1;

  if fish_category_id is null or vegetable_category_id is null or fruit_category_id is null then
    raise exception 'Required catalogue categories were not found';
  end if;

  -- Stockfish pieces / flesh.
  select id into stockfish_id
  from public.products
  where sku='STOCKFISH-PIECES-FLESH' or name='Stockfish (Okporoko)'
  order by case when sku='STOCKFISH-PIECES-FLESH' then 0 else 1 end, id
  limit 1;

  if stockfish_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, main_image_url,
      is_active, in_season, sourcing_type, product_family,
      source_pack_quantity, source_pack_unit, is_portioned, created_at, updated_at
    ) values (
      'Stockfish Pieces (Flesh)', 'Stockfish - Pieced Flesh', 'STOCKFISH-PIECES-FLESH',
      'Dried stockfish flesh pieces sold through fixed pack-count options.',
      fish_category_id,
      'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Okporoko.png',
      true, true, 'staple', 'Dried Stockfish', null, null, false, now(), now()
    ) returning id into stockfish_id;
  else
    update public.products set
      name='Stockfish Pieces (Flesh)',
      local_name='Stockfish - Pieced Flesh',
      sku='STOCKFISH-PIECES-FLESH',
      description='Dried stockfish flesh pieces sold through fixed pack-count options.',
      category_id=fish_category_id,
      main_image_url=coalesce(main_image_url,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Okporoko.png'),
      is_active=true, in_season=true, sourcing_type='staple',
      product_family='Dried Stockfish', source_pack_quantity=null,
      source_pack_unit=null, is_portioned=false, updated_at=now()
    where id=stockfish_id;
  end if;

  delete from public.product_variants where product_id=stockfish_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (stockfish_id,'1 Pack','1 Pack','pack',649,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (stockfish_id,'1 Dozen','1 Dozen','pack',7259,10,'12 packs','pack',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  -- Atlantic horse mackerel / Kote.
  select id into kote_id
  from public.products
  where sku='ATLANTIC-HORSE-MACKEREL-KOTE-20KG' or name='Kote (Horse Mackerel)'
  order by case when sku='ATLANTIC-HORSE-MACKEREL-KOTE-20KG' then 0 else 1 end, id
  limit 1;

  if kote_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Atlantic Horse Mackerel (Kote)','Fish - Kote','ATLANTIC-HORSE-MACKEREL-KOTE-20KG',
      'Atlantic horse mackerel, locally known as Kote, sold through fixed weight and carton options.',
      fish_category_id,
      'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Horse%20Mackerel%20(Kote).png',
      true,true,'fresh','Frozen Fish',20,'kg',true,now(),now()
    ) returning id into kote_id;
  else
    update public.products set
      name='Atlantic Horse Mackerel (Kote)', local_name='Fish - Kote',
      sku='ATLANTIC-HORSE-MACKEREL-KOTE-20KG',
      description='Atlantic horse mackerel, locally known as Kote, sold through fixed weight and carton options.',
      category_id=fish_category_id,
      main_image_url=coalesce(main_image_url,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Horse%20Mackerel%20(Kote).png'),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Frozen Fish',
      source_pack_quantity=20,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=kote_id;
  end if;

  delete from public.product_variants where product_id=kote_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (kote_id,'1kg','1kg','pack',6989,0,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (kote_id,'Quarter Carton (5kg)','Quarter Carton (5kg)','pack',26669,0,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (kote_id,'Half Carton (10kg)','Half Carton (10kg)','pack',52729,0,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (kote_id,'1 Carton (20kg)','1 Carton (20kg)','pack',104349,0,'20kg','kg',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Crayfish base options. Optional blending fees are not stored here because the schema has no per-option service table.
  select id into crayfish_id from public.products where name='Crayfish' order by id limit 1;
  if crayfish_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    ) values (
      'Crayfish','Crayfish','CRAYFISH-FIXED-OPTIONS',
      'Dried crayfish sold through fixed local-measurement options. Optional blending is priced separately.',
      fish_category_id,
      'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Small%20Crayfish%20(Prawns).png',
      true,true,'staple','Dried Seafood',true,now(),now()
    ) returning id into crayfish_id;
  else
    update public.products set
      local_name='Crayfish', sku='CRAYFISH-FIXED-OPTIONS',
      description='Dried crayfish sold through fixed local-measurement options. Optional blending is priced separately.',
      category_id=fish_category_id,
      main_image_url=coalesce(main_image_url,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Small%20Crayfish%20(Prawns).png'),
      is_active=true,in_season=true,sourcing_type='staple',product_family='Dried Seafood',
      source_pack_quantity=null,source_pack_unit=null,is_portioned=true,updated_at=now()
    where id=crayfish_id;
  end if;

  delete from public.product_variants where product_id=crayfish_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (crayfish_id,'1 Cup (50g)','1 Cup (50g)','pack',879,10,'50g','kg',0.05,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Cup'),
    (crayfish_id,'Half Congo (130g)','Half Congo (130g)','pack',3989,10,'130g','kg',0.13,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (crayfish_id,'1 Congo (260g)','1 Congo (260g)','pack',7879,10,'260g','kg',0.26,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');

  -- Spring onion.
  select id into spring_onion_id from public.products where name='Spring Onion' order by id limit 1;
  if spring_onion_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    ) values (
      'Spring Onion','Spring Onion','SPRING-ONION-BUNCHES',
      'Fresh spring onions sold through fixed bunch-count options.',vegetable_category_id,
      'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Spring%20Onions.png',
      true,true,'fresh','Leafy Vegetables',false,now(),now()
    ) returning id into spring_onion_id;
  else
    update public.products set
      local_name='Spring Onion',sku='SPRING-ONION-BUNCHES',
      description='Fresh spring onions sold through fixed bunch-count options.',
      category_id=vegetable_category_id,
      main_image_url=coalesce(main_image_url,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Spring%20Onions.png'),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Leafy Vegetables',
      source_pack_quantity=null,source_pack_unit=null,is_portioned=false,updated_at=now()
    where id=spring_onion_id;
  end if;

  delete from public.product_variants where product_id=spring_onion_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (spring_onion_id,'1 Bunch','1 Bunch','pack',649,0,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (spring_onion_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',3399,0,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (spring_onion_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',6699,0,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  -- Runner beans.
  select id into runner_beans_id from public.products where sku='RUNNER-BEANS-20KG' or name='Runner Beans' order by id limit 1;
  if runner_beans_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Runner Beans','Runner Beans','RUNNER-BEANS-20KG',
      'Fresh runner beans sold through fixed weight and bag options.',vegetable_category_id,
      runner_image_url,true,true,'fresh','Fresh Beans',20,'kg',true,now(),now()
    ) returning id into runner_beans_id;
  else
    update public.products set
      name='Runner Beans',local_name='Runner Beans',sku='RUNNER-BEANS-20KG',
      description='Fresh runner beans sold through fixed weight and bag options.',
      category_id=vegetable_category_id,main_image_url=coalesce(main_image_url,runner_image_url),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Fresh Beans',
      source_pack_quantity=20,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=runner_beans_id;
  end if;

  delete from public.product_variants where product_id=runner_beans_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (runner_beans_id,'250g','250g','pack',1179,0,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (runner_beans_id,'500g','500g','pack',2269,0,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (runner_beans_id,'1kg','1kg','pack',4439,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (runner_beans_id,'Quarter Bag (5kg)','Quarter Bag (5kg)','pack',21119,0,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (runner_beans_id,'Half Bag (10kg)','Half Bag (10kg)','pack',42139,0,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (runner_beans_id,'1 Bag (20kg)','1 Bag (20kg)','pack',84169,0,'20kg','kg',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Red apples.
  select id into red_apple_id from public.products where sku='RED-APPLES' or name='Apple (Red)' order by id limit 1;
  if red_apple_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,
      sourcing_type,product_family,is_portioned,created_at,updated_at
    ) values (
      'Red Apples','Apples - Red','RED-APPLES',
      'Red apples sold through fixed piece-count options.',fruit_category_id,
      'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Red%20Apple.png',
      true,true,'fresh','Apples',false,now(),now()
    ) returning id into red_apple_id;
  else
    update public.products set
      name='Red Apples',local_name='Apples - Red',sku='RED-APPLES',
      description='Red apples sold through fixed piece-count options.',category_id=fruit_category_id,
      main_image_url=coalesce(main_image_url,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Red%20Apple.png'),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Apples',
      source_pack_quantity=null,source_pack_unit=null,is_portioned=false,updated_at=now()
    where id=red_apple_id;
  end if;

  delete from public.product_variants where product_id=red_apple_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,
    min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent
  ) values
    (red_apple_id,'1 Piece','1 Piece','pack',979,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (red_apple_id,'Half Dozen','Half Dozen','pack',5139,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (red_apple_id,'1 Dozen','1 Dozen','pack',10179,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (stockfish_id,p_market_id,'Stockfish - Pieced Flesh',true),
    (kote_id,p_market_id,'Fish - Kote',true),
    (crayfish_id,p_market_id,'Crayfish',true),
    (spring_onion_id,p_market_id,'Spring Onion',true),
    (runner_beans_id,p_market_id,'Runner Beans',true),
    (red_apple_id,p_market_id,'Apples - Red',true)
  on conflict (product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;

  if not exists (select 1 from public.product_images where product_id=runner_beans_id) then
    insert into public.product_images (product_id,variant_id,image_url,alt_text,position,is_primary)
    values (runner_beans_id,null,runner_image_url,'Runner beans',1,true);
  end if;
end
$$;;
