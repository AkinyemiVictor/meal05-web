do $$
declare
  p_market_id uuid := public.default_market_id();
  fruits_id bigint;
  vegetables_id bigint;
  meat_id bigint;
  oils_id bigint;
  red_grape_id bigint;
  green_grape_id bigint;
  pear_id bigint;
  onion_id bigint;
  carrot_id bigint;
  goat_id bigint;
  oil_id bigint;
  chicken_id bigint;
  blueberry_id bigint;
  dates_id bigint;
begin
  select id into fruits_id from public.product_categories where name='Fruits' limit 1;
  select id into vegetables_id from public.product_categories where name='Vegetables' limit 1;
  select id into meat_id from public.product_categories where name='Meat & Poultry' limit 1;
  select id into oils_id from public.product_categories where name='Oil & Cooking Essentials' limit 1;

  if fruits_id is null or vegetables_id is null or meat_id is null or oils_id is null then
    raise exception 'Required catalogue category was not found';
  end if;

  -- Imported Red Grapes: reuse existing generic Grape record.
  select id into red_grape_id
  from public.products
  where sku='IMPORTED-RED-GRAPES' or name='Grape'
  order by case when sku='IMPORTED-RED-GRAPES' then 0 else 1 end, id
  limit 1;

  if red_grape_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, is_active, in_season,
      sourcing_type, product_family, source_pack_quantity, source_pack_unit,
      is_portioned, created_at, updated_at
    ) values (
      'Imported Red Grapes', 'Grapes - Red (Foreign)', 'IMPORTED-RED-GRAPES',
      'Imported red grapes sold through fixed pack and carton options.',
      fruits_id, true, true, 'fresh', 'Imported Grapes', 11, 'pack', false, now(), now()
    ) returning id into red_grape_id;
  else
    update public.products set
      name='Imported Red Grapes', local_name='Grapes - Red (Foreign)',
      sku='IMPORTED-RED-GRAPES',
      description='Imported red grapes sold through fixed pack and carton options.',
      category_id=fruits_id, is_active=true, in_season=true,
      sourcing_type='fresh', product_family='Imported Grapes',
      source_pack_quantity=11, source_pack_unit='pack', is_portioned=false,
      updated_at=now()
    where id=red_grape_id;
  end if;

  delete from public.product_variants where product_id=red_grape_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (red_grape_id,'1 Pack','1 Pack','pack',6639,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (red_grape_id,'Half Carton (6 Packs)','Half Carton (6 Packs)','carton',32769,10,'6 packs','pack',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (red_grape_id,'1 Carton (11 Packs)','1 Carton (11 Packs)','carton',65439,10,'11 packs','pack',11,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- European Pear (English Pear).
  select id into pear_id from public.products where sku='EUROPEAN-PEAR-ENGLISH' limit 1;
  if pear_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'European Pear (English Pear)','Pear - English','EUROPEAN-PEAR-ENGLISH',
      'Imported European pear sold through fixed piece and carton options.',
      fruits_id,true,true,'fresh','Imported Pears',false,now(),now()
    ) returning id into pear_id;
  else
    update public.products set
      name='European Pear (English Pear)',local_name='Pear - English',
      description='Imported European pear sold through fixed piece and carton options.',
      category_id=fruits_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Imported Pears',is_portioned=false,updated_at=now()
    where id=pear_id;
  end if;

  delete from public.product_variants where product_id=pear_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (pear_id,'1 Piece','1 Piece','pack',939,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (pear_id,'6 Pieces','6 Pieces','pack',5109,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (pear_id,'1 Dozen','1 Dozen','pack',10109,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen'),
    (pear_id,'Half Carton','Half Carton','carton',25119,0,'half carton','carton',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (pear_id,'1 Carton','1 Carton','carton',50139,0,'1 carton','carton',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Light Red Onions: reuse Red Onion.
  select id into onion_id
  from public.products
  where sku='LIGHT-RED-ONIONS-100KG' or name='Red Onion'
  order by case when sku='LIGHT-RED-ONIONS-100KG' then 0 else 1 end, id
  limit 1;
  if onion_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Light Red Onions','Onions - Light Red','LIGHT-RED-ONIONS-100KG',
      'Light red onions sold through fixed weight and bag options.',
      vegetables_id,true,true,'fresh','Onions',100,'kg',true,now(),now()
    ) returning id into onion_id;
  else
    update public.products set
      name='Light Red Onions',local_name='Onions - Light Red',sku='LIGHT-RED-ONIONS-100KG',
      description='Light red onions sold through fixed weight and bag options.',
      category_id=vegetables_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Onions',source_pack_quantity=100,source_pack_unit='kg',
      is_portioned=true,updated_at=now()
    where id=onion_id;
  end if;

  delete from public.product_variants where product_id=onion_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (onion_id,'250g','250g','pack',469,10,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (onion_id,'500g','500g','pack',829,10,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (onion_id,'1kg','1kg','pack',1559,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (onion_id,'10kg','10kg','pack',14479,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (onion_id,'Quarter Bag (25kg)','Quarter Bag (25kg)','bag',31729,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (onion_id,'Half Bag (50kg)','Half Bag (50kg)','bag',63349,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (onion_id,'1 Bag (100kg)','1 Bag (100kg)','bag',118349,10,'100kg','kg',100,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Washed Carrots: reuse Carrot.
  select id into carrot_id
  from public.products
  where sku='WASHED-CARROTS-40KG' or name='Carrot'
  order by case when sku='WASHED-CARROTS-40KG' then 0 else 1 end, id
  limit 1;
  if carrot_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Washed Carrots','Carrot - Washed','WASHED-CARROTS-40KG',
      'Washed carrots sold through fixed weight options.',
      vegetables_id,true,true,'fresh','Carrots',40,'kg',true,now(),now()
    ) returning id into carrot_id;
  else
    update public.products set
      name='Washed Carrots',local_name='Carrot - Washed',sku='WASHED-CARROTS-40KG',
      description='Washed carrots sold through fixed weight options.',
      category_id=vegetables_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Carrots',source_pack_quantity=40,source_pack_unit='kg',
      is_portioned=true,updated_at=now()
    where id=carrot_id;
  end if;

  delete from public.product_variants where product_id=carrot_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (carrot_id,'250g','250g','pack',999,0,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (carrot_id,'1kg','1kg','pack',3679,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (carrot_id,'Quarter Bag (10kg)','Quarter Bag (10kg)','bag',34309,0,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag');

  -- Boneless Goat Meat.
  select id into goat_id
  from public.products
  where sku='GOAT-MEAT-BONELESS' or name='Goat meat - Boneless'
  order by case when sku='GOAT-MEAT-BONELESS' then 0 else 1 end, id
  limit 1;
  if goat_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Boneless Goat Meat','Goat Meat - Boneless','GOAT-MEAT-BONELESS',
      'Boneless goat meat sold through fixed weight options.',
      meat_id,true,true,'fresh','Goat Meat',true,now(),now()
    ) returning id into goat_id;
  else
    update public.products set
      name='Boneless Goat Meat',local_name='Goat Meat - Boneless',sku='GOAT-MEAT-BONELESS',
      description='Boneless goat meat sold through fixed weight options.',
      category_id=meat_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Goat Meat',is_portioned=true,updated_at=now()
    where id=goat_id;
  end if;

  delete from public.product_variants where product_id=goat_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (goat_id,'500g','500g','pack',5619,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (goat_id,'1kg','1kg','pack',10639,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- King's Vegetable Oil 5L.
  select id into oil_id
  from public.products
  where sku='KINGS-VEGETABLE-OIL-5L' or name='King''s Vegetable Oil'
  order by case when sku='KINGS-VEGETABLE-OIL-5L' then 0 else 1 end, id
  limit 1;
  if oil_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,brand,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'King''s Vegetable Oil - 5L','King''s Vegetable Oil (5L)','KINGS-VEGETABLE-OIL-5L',
      'King''s branded vegetable oil in 5-litre kegs, sold by keg or carton.',
      oils_id,true,true,'staple','Vegetable Oil','King''s',5,'litre',false,now(),now()
    ) returning id into oil_id;
  else
    update public.products set
      name='King''s Vegetable Oil - 5L',local_name='King''s Vegetable Oil (5L)',
      sku='KINGS-VEGETABLE-OIL-5L',
      description='King''s branded vegetable oil in 5-litre kegs, sold by keg or carton.',
      category_id=oils_id,is_active=true,in_season=true,sourcing_type='staple',
      product_family='Vegetable Oil',brand='King''s',source_pack_quantity=5,
      source_pack_unit='litre',is_portioned=false,updated_at=now()
    where id=oil_id;
  end if;

  delete from public.product_variants where product_id=oil_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (oil_id,'1 Keg','1 Keg','keg',18179,10,'5L','litre',5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Keg'),
    (oil_id,'1 Carton (4 Kegs)','1 Carton (4 Kegs)','carton',72419,10,'20L','litre',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Frozen Hard Chicken Legs (Orobo): reuse Chicken Thighs (Lap).
  select id into chicken_id
  from public.products
  where sku='FROZEN-HARD-CHICKEN-LEGS-OROBO-10KG' or name='Chicken Thighs (Lap)'
  order by case when sku='FROZEN-HARD-CHICKEN-LEGS-OROBO-10KG' then 0 else 1 end, id
  limit 1;
  if chicken_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Frozen Hard Chicken Legs (Orobo)','Chicken - Hard Lap Orobo',
      'FROZEN-HARD-CHICKEN-LEGS-OROBO-10KG',
      'Frozen hard chicken legs, locally called Orobo, sold through fixed weight and carton options.',
      meat_id,true,true,'staple','Frozen Chicken Cuts',10,'kg',true,now(),now()
    ) returning id into chicken_id;
  else
    update public.products set
      name='Frozen Hard Chicken Legs (Orobo)',local_name='Chicken - Hard Lap Orobo',
      sku='FROZEN-HARD-CHICKEN-LEGS-OROBO-10KG',
      description='Frozen hard chicken legs, locally called Orobo, sold through fixed weight and carton options.',
      category_id=meat_id,is_active=true,in_season=true,sourcing_type='staple',
      product_family='Frozen Chicken Cuts',source_pack_quantity=10,source_pack_unit='kg',
      is_portioned=true,updated_at=now()
    where id=chicken_id;
  end if;

  delete from public.product_variants where product_id=chicken_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    weight_raw,weight_min,weight_max,weight_unit,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (chicken_id,'1kg','1kg','pack',6999,10,'1kg','kg',1,null,null,null,null,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (chicken_id,'Quarter Carton (2.25-2.5kg)','Quarter Carton (2.25-2.5kg)','carton',16239,10,'2.25-2.5kg','kg',null,'2.25-2.5kg',2.25,2.5,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (chicken_id,'Half Carton (4.5-5kg)','Half Carton (4.5-5kg)','carton',31879,10,'4.5-5kg','kg',null,'4.5-5kg',4.5,5,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (chicken_id,'1 Carton (9-10kg)','1 Carton (9-10kg)','carton',62649,10,'9-10kg','kg',null,'9-10kg',9,10,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Blueberries.
  select id into blueberry_id from public.products where sku='BLUEBERRIES-1-PACK' limit 1;
  if blueberry_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Blueberries','Blueberries','BLUEBERRIES-1-PACK',
      'Fresh blueberries sold as one fixed retail pack.',
      fruits_id,true,true,'fresh','Berries',false,now(),now()
    ) returning id into blueberry_id;
  else
    update public.products set
      name='Blueberries',local_name='Blueberries',
      description='Fresh blueberries sold as one fixed retail pack.',
      category_id=fruits_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Berries',is_portioned=false,updated_at=now()
    where id=blueberry_id;
  end if;

  delete from public.product_variants where product_id=blueberry_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (blueberry_id,'1 Pack','1 Pack','pack',6549,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Dates: reuse Date.
  select id into dates_id
  from public.products
  where sku='DATES-1.4KG' or name='Date'
  order by case when sku='DATES-1.4KG' then 0 else 1 end, id
  limit 1;
  if dates_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Dates','Dates','DATES-1.4KG','Dates sold through fixed local-measurement options.',
      fruits_id,true,true,'fresh','Dates',1.4,'kg',true,now(),now()
    ) returning id into dates_id;
  else
    update public.products set
      name='Dates',local_name='Dates',sku='DATES-1.4KG',
      description='Dates sold through fixed local-measurement options.',
      category_id=fruits_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Dates',source_pack_quantity=1.4,source_pack_unit='kg',
      is_portioned=true,updated_at=now()
    where id=dates_id;
  end if;

  delete from public.product_variants where product_id=dates_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (dates_id,'1 Derica (500g)','1 Derica (500g)','pack',2659,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Derica'),
    (dates_id,'Half Congo (700g)','Half Congo (700g)','pack',3059,10,'700g','kg',0.7,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (dates_id,'1 Congo (1.4kg)','1 Congo (1.4kg)','pack',6019,10,'1.4kg','kg',1.4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');

  -- Imported Green Grapes.
  select id into green_grape_id from public.products where sku='IMPORTED-GREEN-GRAPES' limit 1;
  if green_grape_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    ) values (
      'Imported Green Grapes','Grapes - Green (Foreign)','IMPORTED-GREEN-GRAPES',
      'Imported green grapes sold through fixed pack and carton options.',
      fruits_id,true,true,'fresh','Imported Grapes',false,now(),now()
    ) returning id into green_grape_id;
  else
    update public.products set
      name='Imported Green Grapes',local_name='Grapes - Green (Foreign)',
      description='Imported green grapes sold through fixed pack and carton options.',
      category_id=fruits_id,is_active=true,in_season=true,sourcing_type='fresh',
      product_family='Imported Grapes',is_portioned=false,updated_at=now()
    where id=green_grape_id;
  end if;

  delete from public.product_variants where product_id=green_grape_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (green_grape_id,'1 Pack','1 Pack','pack',6309,0,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (green_grape_id,'Half Carton','Half Carton','carton',31139,0,'half carton','carton',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (green_grape_id,'1 Carton','1 Carton','carton',62179,0,'1 carton','carton',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Ensure all products are listed in the default market.
  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (red_grape_id,p_market_id,'Grapes - Red (Foreign)',true),
    (pear_id,p_market_id,'Pear - English',true),
    (onion_id,p_market_id,'Onions - Light Red',true),
    (carrot_id,p_market_id,'Carrot - Washed',true),
    (goat_id,p_market_id,'Goat Meat - Boneless',true),
    (oil_id,p_market_id,'King''s Vegetable Oil (5L)',true),
    (chicken_id,p_market_id,'Chicken - Hard Lap Orobo',true),
    (blueberry_id,p_market_id,'Blueberries',true),
    (dates_id,p_market_id,'Dates',true),
    (green_grape_id,p_market_id,'Grapes - Green (Foreign)',true)
  on conflict (product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;

  -- Attach standalone images only when a suitable existing asset is available.
  if not exists (select 1 from public.product_images where product_id=blueberry_id) then
    null;
  end if;
end
$$;;
