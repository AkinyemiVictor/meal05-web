do $$
declare
  p_market_id uuid := public.default_market_id();
  fish_category_id bigint;
  meat_category_id bigint;
  tuber_category_id bigint;
  tilapia_id bigint;
  tiger_id bigint;
  pelebe_id bigint;
  ponmo_id bigint;
  prawn_id bigint;
  bonga_id bigint;
  turkey_mid_id bigint;
  turkey_wings_id bigint;
  croaker_id bigint;
begin
  select id into fish_category_id from public.product_categories where name='Fish & Seafood' limit 1;
  select id into meat_category_id from public.product_categories where name='Meat & Poultry' limit 1;
  select id into tuber_category_id from public.product_categories where name='Tubers & Legumes' limit 1;

  if fish_category_id is null or meat_category_id is null or tuber_category_id is null then raise exception 'Required category missing'; end if;

  select id into tilapia_id from public.products where sku='IMPORTED-FROZEN-TILAPIA-10KG' or name='Tilapia Fish (Oreochromis Niloticus)' order by case when sku='IMPORTED-FROZEN-TILAPIA-10KG' then 0 else 1 end, id limit 1;
  if tilapia_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Imported Frozen Tilapia','Foreign Tilapia','IMPORTED-FROZEN-TILAPIA-10KG','Imported frozen whole tilapia sold through fixed piece and carton options.',fish_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Tilapia%20Fish.png',true,true,'fresh','Frozen Tilapia',10,'kg',true,now(),now()) returning id into tilapia_id;
  else
    update public.products set name='Imported Frozen Tilapia',local_name='Foreign Tilapia',sku='IMPORTED-FROZEN-TILAPIA-10KG',description='Imported frozen whole tilapia sold through fixed piece and carton options.',category_id=fish_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Frozen Tilapia',source_pack_quantity=10,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=tilapia_id;
  end if;
  delete from public.product_variants where product_id=tilapia_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (tilapia_id,'1 Piece','1 Piece','pack',2399,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (tilapia_id,'Quarter Carton (2.5kg)','Quarter Carton (2.5kg)','pack',6199,0,'2.5kg','kg',2.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (tilapia_id,'Half Carton (5kg)','Half Carton (5kg)','pack',11799,0,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (tilapia_id,'1 Carton (10kg)','1 Carton (10kg)','pack',22499,0,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  select id into tiger_id from public.products where sku='TIGER-NUTS-1KG' or name='Tiger Nut' order by case when sku='TIGER-NUTS-1KG' then 0 else 1 end, id limit 1;
  if tiger_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Tiger Nuts','Tiger Nuts','TIGER-NUTS-1KG','Tiger nuts sold through fixed local measurement options.',tuber_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Tigernut.png',true,true,'fresh','Tiger Nuts',1,'kg',true,now(),now()) returning id into tiger_id;
  else
    update public.products set name='Tiger Nuts',local_name='Tiger Nuts',sku='TIGER-NUTS-1KG',description='Tiger nuts sold through fixed local measurement options.',category_id=tuber_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Tiger Nuts',source_pack_quantity=1,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=tiger_id;
  end if;
  delete from public.product_variants where product_id=tiger_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (tiger_id,'1 Cup (100g)','1 Cup (100g)','pack',439,10,'100g','kg',0.1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Cup'),
    (tiger_id,'Half Congo (500g)','Half Congo (500g)','pack',1669,10,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (tiger_id,'1 Congo (1kg)','1 Congo (1kg)','pack',3239,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');

  select id into pelebe_id from public.products where sku='PELEBE-BEANS-50KG' or name='Beans (Pelebe)' order by case when sku='PELEBE-BEANS-50KG' then 0 else 1 end, id limit 1;
  if pelebe_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Pelebe Beans','Beans - Pelebe','PELEBE-BEANS-50KG','Pelebe beans sold through fixed local measurement and bag options.',tuber_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/beans%20-%20pelebe.png',true,true,'staple','Beans and Legumes',50,'kg',true,now(),now()) returning id into pelebe_id;
  else
    update public.products set name='Pelebe Beans',local_name='Beans - Pelebe',sku='PELEBE-BEANS-50KG',description='Pelebe beans sold through fixed local measurement and bag options.',category_id=tuber_category_id,is_active=true,in_season=true,sourcing_type='staple',product_family='Beans and Legumes',source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=pelebe_id;
  end if;
  delete from public.product_variants where product_id=pelebe_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (pelebe_id,'Half Congo (700g)','Half Congo (700g)','pack',959,0,'700g','kg',0.7,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (pelebe_id,'1 Congo (1.4kg)','1 Congo (1.4kg)','pack',1819,0,'1.4kg','kg',1.4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (pelebe_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',17749,0,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (pelebe_id,'Half Bag (25kg)','Half Bag (25kg)','pack',35389,0,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (pelebe_id,'1 Bag (50kg)','1 Bag (50kg)','pack',70669,0,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  select id into ponmo_id from public.products where sku='COW-SKIN-PONMO' or name='Cow Skin (Ponmo)' limit 1;
  if ponmo_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Cow Skin (Ponmo)','Ponmo','COW-SKIN-PONMO','Prepared cow skin, locally known as ponmo, sold by fixed piece counts.',meat_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ponmo.png',true,true,'fresh','Cow Skin',false,now(),now()) returning id into ponmo_id;
  else
    update public.products set name='Cow Skin (Ponmo)',local_name='Ponmo',description='Prepared cow skin, locally known as ponmo, sold by fixed piece counts.',category_id=meat_category_id,main_image_url='https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ponmo.png',is_active=true,in_season=true,sourcing_type='fresh',product_family='Cow Skin',is_portioned=false,updated_at=now() where id=ponmo_id;
  end if;
  delete from public.product_variants where product_id=ponmo_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (ponmo_id,'1 Piece','1 Piece','pack',649,10,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (ponmo_id,'4 Pieces','4 Pieces','pack',2299,10,'4 pieces','piece',4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (ponmo_id,'10 Pieces','10 Pieces','pack',5599,10,'10 pieces','piece',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (ponmo_id,'20 Pieces','20 Pieces','pack',11099,10,'20 pieces','piece',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into prawn_id from public.products where sku='LARGE-PRAWNS-300G' or name='Large Prawns' limit 1;
  if prawn_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Large Prawns','Big Prawn','LARGE-PRAWNS-300G','Large prawns sold through fixed gram and local-measurement options.',fish_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Medium%20Crayfish%20(Prawn).png',true,true,'fresh','Prawns',0.3,'kg',true,now(),now()) returning id into prawn_id;
  else
    update public.products set name='Large Prawns',local_name='Big Prawn',description='Large prawns sold through fixed gram and local-measurement options.',category_id=fish_category_id,main_image_url='https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Medium%20Crayfish%20(Prawn).png',is_active=true,in_season=true,sourcing_type='fresh',product_family='Prawns',source_pack_quantity=0.3,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=prawn_id;
  end if;
  delete from public.product_variants where product_id=prawn_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (prawn_id,'50g','50g','pack',2559,0,'50g','kg',0.05,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (prawn_id,'Half Congo (150g)','Half Congo (150g)','pack',11849,0,'150g','kg',0.15,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Congo'),
    (prawn_id,'1 Congo (300g)','1 Congo (300g)','pack',23599,0,'300g','kg',0.3,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo');

  select id into bonga_id from public.products where sku='BONGA-SHAD-AGBODO' or name='Bonga Shad (Agbodo)' limit 1;
  if bonga_id is null then
    insert into public.products (name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Bonga Shad (Agbodo)','Agbodo','BONGA-SHAD-AGBODO','Bonga shad, locally called Agbodo, sold by fixed piece counts.',fish_category_id,true,true,'fresh','Bonga Fish',false,now(),now()) returning id into bonga_id;
  else
    update public.products set name='Bonga Shad (Agbodo)',local_name='Agbodo',description='Bonga shad, locally called Agbodo, sold by fixed piece counts.',category_id=fish_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Bonga Fish',is_portioned=false,updated_at=now() where id=bonga_id;
  end if;
  delete from public.product_variants where product_id=bonga_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (bonga_id,'1 Piece','1 Piece','pack',999,0,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (bonga_id,'2 Pieces','2 Pieces','pack',1899,0,'2 pieces','piece',2,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into turkey_mid_id from public.products where sku='TURKEY-MID-WINGS-10KG' or name='Turkey Mid Wings' limit 1;
  if turkey_mid_id is null then
    insert into public.products (name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Turkey Mid-Wings','Turkey Mid Wings','TURKEY-MID-WINGS-10KG','Turkey middle-wing portions sold through fixed weight and carton options.',meat_category_id,true,true,'fresh','Turkey Cuts',10,'kg',true,now(),now()) returning id into turkey_mid_id;
  else
    update public.products set name='Turkey Mid-Wings',local_name='Turkey Mid Wings',description='Turkey middle-wing portions sold through fixed weight and carton options.',category_id=meat_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Turkey Cuts',source_pack_quantity=10,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=turkey_mid_id;
  end if;
  delete from public.product_variants where product_id=turkey_mid_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,weight_min,weight_max,weight_unit,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (turkey_mid_id,'500g','500g','pack',5599,10,'500g','kg',0.5,null,null,null,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (turkey_mid_id,'1kg','1kg','pack',12169,10,'1kg','kg',1,null,null,null,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (turkey_mid_id,'Quarter Carton (2.25-2.5kg)','Quarter Carton (2.25-2.5kg)','pack',29529,10,'2.25-2.5kg','kg',null,2.25,2.5,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (turkey_mid_id,'Half Carton (4.5-5kg)','Half Carton (4.5-5kg)','pack',58459,10,'4.5-5kg','kg',null,4.5,5,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (turkey_mid_id,'1 Carton (9-10kg)','1 Carton (9-10kg)','pack',115809,10,'9-10kg','kg',null,9,10,'kg',false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into turkey_wings_id from public.products where sku='TURKEY-WINGS-10KG' or name='Turkey Wings' order by case when sku='TURKEY-WINGS-10KG' then 0 else 1 end, id limit 1;
  if turkey_wings_id is null then
    insert into public.products (name,sku,description,category_id,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Turkey Wings','TURKEY-WINGS-10KG','Turkey wings sold through fixed weight and carton options.',meat_category_id,true,true,'fresh','Turkey Cuts',10,'kg',true,now(),now()) returning id into turkey_wings_id;
  else
    update public.products set name='Turkey Wings',sku='TURKEY-WINGS-10KG',description='Turkey wings sold through fixed weight and carton options.',category_id=meat_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Turkey Cuts',source_pack_quantity=10,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=turkey_wings_id;
  end if;
  delete from public.product_variants where product_id=turkey_wings_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (turkey_wings_id,'1kg','1kg','pack',9019,10,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (turkey_wings_id,'Quarter Carton (2.5kg)','Quarter Carton (2.5kg)','pack',21639,10,'2.5kg','kg',2.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (turkey_wings_id,'Half Carton (5kg)','Half Carton (5kg)','pack',42679,10,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (turkey_wings_id,'1 Carton (10kg)','1 Carton (10kg)','pack',84249,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  select id into croaker_id from public.products where sku='CROAKER-FISH-20KG' or name='Croaker (White)' order by case when sku='CROAKER-FISH-20KG' then 0 else 1 end, id limit 1;
  if croaker_id is null then
    insert into public.products (name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Croaker Fish','CROAKER-FISH-20KG','Croaker fish sold through fixed weight and carton options.',fish_category_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Croaker%20Fish.png',true,true,'fresh','Croaker Fish',20,'kg',true,now(),now()) returning id into croaker_id;
  else
    update public.products set name='Croaker Fish',sku='CROAKER-FISH-20KG',description='Croaker fish sold through fixed weight and carton options.',category_id=fish_category_id,is_active=true,in_season=true,sourcing_type='fresh',product_family='Croaker Fish',source_pack_quantity=20,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=croaker_id;
  end if;
  delete from public.product_variants where product_id=croaker_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (croaker_id,'1kg','1kg','pack',6349,10,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (croaker_id,'Quarter Carton (5kg)','Quarter Carton (5kg)','pack',28599,10,'5kg','kg',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (croaker_id,'Half Carton (10kg)','Half Carton (10kg)','pack',56599,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (croaker_id,'1 Carton (20kg)','1 Carton (20kg)','pack',112099,10,'20kg','kg',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Carton');

  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (tilapia_id,p_market_id,'Foreign Tilapia',true),(tiger_id,p_market_id,'Tiger Nuts',true),(pelebe_id,p_market_id,'Beans - Pelebe',true),(ponmo_id,p_market_id,'Ponmo',true),(prawn_id,p_market_id,'Big Prawn',true),(bonga_id,p_market_id,'Bonga Fish Agbodo',true),(turkey_mid_id,p_market_id,'Turkey Mid Wings',true),(turkey_wings_id,p_market_id,'Turkey Wings',true),(croaker_id,p_market_id,'Fish - Croaker',true)
  on conflict (product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;

  if not exists (select 1 from public.product_images where product_id=ponmo_id) then
    insert into public.product_images (product_id,image_url,alt_text,position,is_primary,original_url) values (ponmo_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ponmo.png','Cow Skin (Ponmo)',1,true,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ponmo.png');
  end if;
  if not exists (select 1 from public.product_images where product_id=prawn_id) then
    insert into public.product_images (product_id,image_url,alt_text,position,is_primary,original_url) values (prawn_id,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Medium%20Crayfish%20(Prawn).png','Large Prawns',1,true,'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Medium%20Crayfish%20(Prawn).png');
  end if;
end
$$;;
