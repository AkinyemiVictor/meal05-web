do $$
declare
  p_market_id uuid := public.default_market_id();
  ugu_id bigint := 103;
  scent_id bigint := 105;
  rodo_id bigint := 112;
  tomato_a_id bigint;
  red_onion_id bigint;
  irish_peach_id bigint;
  source_image record;
begin
  -- Fluted Pumpkin Leaves (Ugu)
  update public.products
  set name='Fluted Pumpkin Leaves (Ugu)',
      local_name='Ugu',
      sku='FLUTED-PUMPKIN-LEAVES-UGU',
      description='Fresh fluted pumpkin leaves, commonly called Ugu, sold through fixed bunch options.',
      product_family='Leafy Vegetables',
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      is_portioned=false,
      updated_at=now()
  where id=ugu_id;

  delete from public.product_variants where product_id=ugu_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent
  ) values
    (ugu_id,'1 Bunch','1 Bunch','pack',729,null,10,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (ugu_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',3969,null,10,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (ugu_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',7839,null,10,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  -- Scent Leaf (Clove Basil)
  update public.products
  set name='Scent Leaf (Clove Basil)',
      local_name='Scent Leaf / Efirin',
      sku='SCENT-LEAF-CLOVE-BASIL',
      description='Fresh scent leaf, also known as clove basil or Efirin, sold through fixed bunch options.',
      product_family='Leafy Herbs',
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      is_portioned=false,
      updated_at=now()
  where id=scent_id;

  delete from public.product_variants where product_id=scent_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent
  ) values
    (scent_id,'1 Bunch','1 Bunch','pack',379,null,0,'1 bunch','bunch',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (scent_id,'Half Dozen (6 Bunches)','Half Dozen (6 Bunches)','pack',1749,null,0,'6 bunches','bunch',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (scent_id,'1 Dozen (12 Bunches)','1 Dozen (12 Bunches)','pack',3399,null,0,'12 bunches','bunch',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen');

  -- Scotch Bonnet Pepper (Ata Rodo) - Grade A
  update public.products
  set name='Scotch Bonnet Pepper (Ata Rodo) - Grade A',
      local_name='Pepper - Ata Rodo Grade A',
      sku='SCOTCH-BONNET-ATA-RODO-GRADE-A-25KG',
      description='Grade A Scotch bonnet pepper, locally called Ata Rodo, sold through fixed weight and market-measure options.',
      product_family='Scotch Bonnet Pepper - Grade A',
      source_pack_quantity=25,
      source_pack_unit='kg',
      is_portioned=true,
      is_active=true,
      in_season=true,
      sourcing_type='fresh',
      updated_at=now()
  where id=rodo_id;

  delete from public.product_variants where product_id=rodo_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent,grade
  ) values
    (rodo_id,'250g','250g','pack',2299,null,10,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'A'),
    (rodo_id,'Half Paint Bucket (875g)','Half Paint Bucket (875g)','pack',5049,null,10,'875g','kg',0.875,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Paint Bucket','A'),
    (rodo_id,'1kg','1kg','pack',6699,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'A'),
    (rodo_id,'1 Paint Bucket (1.75kg)','1 Paint Bucket (1.75kg)','pack',9999,null,10,'1.75kg','kg',1.75,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket','A'),
    (rodo_id,'Quarter Bag (6.25kg)','Quarter Bag (6.25kg)','pack',35849,null,10,'6.25kg','kg',6.25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag','A'),
    (rodo_id,'Half Bag (12.5kg)','Half Bag (12.5kg)','pack',71599,null,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag','A'),
    (rodo_id,'1 Bag (25kg)','1 Bag (25kg)','pack',143099,null,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag','A');

  -- Fresh Tomato - Grade A (separate from Grade B)
  select id into tomato_a_id from public.products where sku='FRESH-TOMATO-GRADE-A' limit 1;
  if tomato_a_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    )
    select 'Fresh Tomato - Grade A','Tomato - Grade A','FRESH-TOMATO-GRADE-A',
           'Grade A fresh tomatoes sold through fixed weight and basket options.',
           category_id,main_image_url,true,true,'fresh','Fresh Tomato - Grade A',50,'kg',true,now(),now()
    from public.products where id=101
    returning id into tomato_a_id;
  else
    update public.products
    set name='Fresh Tomato - Grade A',local_name='Tomato - Grade A',
        description='Grade A fresh tomatoes sold through fixed weight and basket options.',
        category_id=3,main_image_url=(select main_image_url from public.products where id=101),
        is_active=true,in_season=true,sourcing_type='fresh',product_family='Fresh Tomato - Grade A',
        source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=tomato_a_id;
  end if;

  delete from public.product_variants where product_id=tomato_a_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent,grade
  ) values
    (tomato_a_id,'500g','500g','pack',1849,null,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'A'),
    (tomato_a_id,'1kg','1kg','pack',3599,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'A'),
    (tomato_a_id,'Half Paint Bucket (1.75kg)','Half Paint Bucket (1.75kg)','pack',5369,null,10,'1.75kg','kg',1.75,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Paint Bucket','A'),
    (tomato_a_id,'1 Paint Bucket (3.5kg)','1 Paint Bucket (3.5kg)','pack',10639,null,10,'3.5kg','kg',3.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket','A'),
    (tomato_a_id,'Quarter Basket (12.5kg)','Quarter Basket (12.5kg)','pack',34099,null,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Basket','A'),
    (tomato_a_id,'Half Basket (25kg)','Half Basket (25kg)','pack',68099,null,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Basket','A'),
    (tomato_a_id,'1 Basket (50kg)','1 Basket (50kg)','pack',135949,null,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Basket','A');

  -- Red Onions (separate from Light Red Onions)
  select id into red_onion_id from public.products where sku='RED-ONIONS-100KG' limit 1;
  if red_onion_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    )
    select 'Red Onions','Onions - Red','RED-ONIONS-100KG',
           'Red onions sold through fixed weight and bag options.',
           category_id,main_image_url,true,true,'fresh','Onions',100,'kg',true,now(),now()
    from public.products where id=117
    returning id into red_onion_id;
  else
    update public.products
    set name='Red Onions',local_name='Onions - Red',description='Red onions sold through fixed weight and bag options.',
        category_id=3,main_image_url=(select main_image_url from public.products where id=117),
        is_active=true,in_season=true,sourcing_type='fresh',product_family='Onions',
        source_pack_quantity=100,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=red_onion_id;
  end if;

  delete from public.product_variants where product_id=red_onion_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent
  ) values
    (red_onion_id,'250g','250g','pack',519,null,10,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (red_onion_id,'1kg','1kg','pack',1779,null,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (red_onion_id,'10kg','10kg','pack',12789,null,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (red_onion_id,'Quarter Bag (25kg)','Quarter Bag (25kg)','pack',61919,null,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (red_onion_id,'Half Bag (50kg)','Half Bag (50kg)','pack',63349,null,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (red_onion_id,'1 Bag (100kg)','1 Bag (100kg)','pack',118349,null,10,'100kg','kg',100,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Irish Peach Apples
  select id into irish_peach_id from public.products where sku='IRISH-PEACH-APPLES' limit 1;
  if irish_peach_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      product_family,is_portioned,created_at,updated_at
    )
    select 'Irish Peach Apples','Apples - Irish Peach','IRISH-PEACH-APPLES',
           'Irish Peach apples sold through fixed piece and carton options.',
           category_id,main_image_url,true,true,'fresh','Apples',false,now(),now()
    from public.products where id=31
    returning id into irish_peach_id;
  else
    update public.products
    set name='Irish Peach Apples',local_name='Apples - Irish Peach',
        description='Irish Peach apples sold through fixed piece and carton options.',
        category_id=7,main_image_url=(select main_image_url from public.products where id=31),
        is_active=true,in_season=true,sourcing_type='fresh',product_family='Apples',is_portioned=false,updated_at=now()
    where id=irish_peach_id;
  end if;

  delete from public.product_variants where product_id=irish_peach_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,old_price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,
    option_role,local_measurement_equivalent
  ) values
    (irish_peach_id,'1 Piece','1 Piece','pack',979,null,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (irish_peach_id,'Half Dozen','Half Dozen','pack',5379,null,0,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Dozen'),
    (irish_peach_id,'1 Dozen','1 Dozen','pack',10659,null,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Dozen'),
    (irish_peach_id,'Quarter Carton (25 Pieces)','Quarter Carton (25 Pieces)','pack',21099,null,0,'25 pieces','piece',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (irish_peach_id,'Half Carton (50 Pieces)','Half Carton (50 Pieces)','pack',42099,null,0,'50 pieces','piece',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (irish_peach_id,'1 Carton (100 Pieces)','1 Carton (100 Pieces)','pack',84099,null,0,'100 pieces','piece',100,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Market listings
  insert into public.product_markets(product_id,market_id,local_name,is_listed)
  values
    (ugu_id,p_market_id,'Ugu',true),
    (scent_id,p_market_id,'Scent Leaf (Clove Basil)',true),
    (rodo_id,p_market_id,'Pepper - Ata Rodo Grade A',true),
    (tomato_a_id,p_market_id,'Tomato - Grade A',true),
    (red_onion_id,p_market_id,'Onions - Red',true),
    (irish_peach_id,p_market_id,'Apples - Irish Peach',true)
  on conflict(product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;

  -- Copy source image rows for newly created products where possible.
  if not exists(select 1 from public.product_images where product_id=tomato_a_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select tomato_a_id,null,image_url,'Grade A fresh tomatoes',1,true,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=101 order by is_primary desc,position,id limit 1;
  end if;

  if not exists(select 1 from public.product_images where product_id=red_onion_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select red_onion_id,null,image_url,'Red onions',1,true,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=117 order by is_primary desc,position,id limit 1;
  end if;

  if not exists(select 1 from public.product_images where product_id=irish_peach_id) then
    insert into public.product_images(product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at)
    select irish_peach_id,null,image_url,'Irish Peach apples',1,true,thumb_url,card_url,detail_url,original_url,image_width,image_height,normalized_at
    from public.product_images where product_id=31 order by is_primary desc,position,id limit 1;
  end if;
end $$;;
