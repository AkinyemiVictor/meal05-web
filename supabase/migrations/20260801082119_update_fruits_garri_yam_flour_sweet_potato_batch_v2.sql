do $$
declare
  p_market_id uuid := public.default_market_id();
  fruits_category_id bigint;
  grains_category_id bigint;
  tubers_category_id bigint;
  pantry_category_id bigint;
  orange_id bigint;
  avocado_id bigint;
  star_apple_id bigint;
  strawberry_id bigint;
  ijebu_garri_id bigint;
  yam_flour_id bigint;
  sweet_potato_id bigint;
  yellow_garri_id bigint;
  strawberry_url text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Strawberry.png';
  yellow_garri_url text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Yellow%20Garri.png';
begin
  select id into fruits_category_id from public.product_categories where slug='fruits' or lower(name)='fruits' limit 1;
  select id into grains_category_id from public.product_categories where slug='grains-cereals' or lower(name)='grains & cereals' limit 1;
  select id into tubers_category_id from public.product_categories where slug='tubers-legumes' or lower(name)='tubers & legumes' limit 1;
  select id into pantry_category_id from public.product_categories where slug='pantry-processed-foods' or lower(name)='pantry & processed foods' limit 1;

  if fruits_category_id is null or grains_category_id is null or tubers_category_id is null or pantry_category_id is null then
    raise exception 'One or more required categories are missing';
  end if;

  select id into orange_id from public.products where name='Orange' or sku='SWEET-ORANGE-SEMI-RIPE-MEDIUM' order by case when sku='SWEET-ORANGE-SEMI-RIPE-MEDIUM' then 0 else 1 end, id limit 1;
  if orange_id is null then raise exception 'Orange product not found'; end if;
  update public.products set name='Sweet Orange - Semi-Ripe (Medium)',local_name='Orange - Semi-ripe (Medium)',sku='SWEET-ORANGE-SEMI-RIPE-MEDIUM',description='Medium-sized semi-ripe sweet oranges sold through fixed piece-count options.',category_id=fruits_category_id,product_family='Sweet Orange',sourcing_type='fresh',is_active=true,in_season=true,is_portioned=false,source_pack_quantity=null,source_pack_unit=null,updated_at=now() where id=orange_id;
  delete from public.product_variants where product_id=orange_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (orange_id,'4 Pieces','4 Pieces','pack',669,0,'4 pieces','piece',4,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (orange_id,'1 Dozen (12 Pieces)','1 Dozen (12 Pieces)','pack',1839,0,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into avocado_id from public.products where name='Avocado (Local)' or sku='LOCAL-AVOCADO-SIZE-OPTIONS' order by case when sku='LOCAL-AVOCADO-SIZE-OPTIONS' then 0 else 1 end, id limit 1;
  if avocado_id is null then raise exception 'Local avocado product not found'; end if;
  update public.products set name='Avocado',local_name='Local Avocado',sku='LOCAL-AVOCADO-SIZE-OPTIONS',description='Local avocado sold in Small, Medium, and Big fixed piece-count options.',category_id=fruits_category_id,product_family='Local Avocado',sourcing_type='fresh',is_active=true,in_season=true,is_portioned=false,source_pack_quantity=null,source_pack_unit=null,updated_at=now() where id=avocado_id;
  delete from public.product_variants where product_id=avocado_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (avocado_id,'Small, 1 Piece','Small, 1 Piece','pack',339,0,'Small','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Medium, 1 Piece','Medium, 1 Piece','pack',429,0,'Medium','piece',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Big, 1 Piece','Big, 1 Piece','pack',469,0,'Big','piece',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Small, Half Dozen','Small, Half Dozen','pack',1529,0,'Small','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Medium, Half Dozen','Medium, Half Dozen','pack',2079,0,'Medium','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Big, Half Dozen','Big, Half Dozen','pack',2329,0,'Big','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Small, 1 Dozen','Small, 1 Dozen','pack',2959,0,'Small','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Medium, 1 Dozen','Medium, 1 Dozen','pack',4049,0,'Medium','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (avocado_id,'Big, 1 Dozen','Big, 1 Dozen','pack',4559,0,'Big','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into star_apple_id from public.products where name='Cherry (Agbalumo)' or sku='AFRICAN-STAR-APPLE-AGBALUMO' order by case when sku='AFRICAN-STAR-APPLE-AGBALUMO' then 0 else 1 end, id limit 1;
  if star_apple_id is null then raise exception 'Agbalumo product not found'; end if;
  update public.products set name='African Star Apple (Agbalumo)',local_name='Agbalumo',sku='AFRICAN-STAR-APPLE-AGBALUMO',description='African star apple, locally known as Agbalumo, sold through fixed piece-count options.',category_id=fruits_category_id,product_family='African Star Apple',sourcing_type='fresh',is_active=true,in_season=true,is_portioned=false,source_pack_quantity=null,source_pack_unit=null,updated_at=now() where id=star_apple_id;
  delete from public.product_variants where product_id=star_apple_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (star_apple_id,'5 Pieces','5 Pieces','pack',369,0,'5 pieces','piece',5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (star_apple_id,'10 Pieces','10 Pieces','pack',629,0,'10 pieces','piece',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (star_apple_id,'25 Pieces','25 Pieces','pack',1419,0,'25 pieces','piece',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  select id into strawberry_id from public.products where sku='NIGERIAN-STRAWBERRY-PACK' limit 1;
  if strawberry_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Nigerian Strawberry','Strawberry - Nigerian','NIGERIAN-STRAWBERRY-PACK','Nigerian strawberries sold in fixed retail packs.',fruits_category_id,strawberry_url,true,true,'fresh','Strawberry',false,now(),now()) returning id into strawberry_id;
  else
    update public.products set name='Nigerian Strawberry',local_name='Strawberry - Nigerian',description='Nigerian strawberries sold in fixed retail packs.',category_id=fruits_category_id,main_image_url=strawberry_url,is_active=true,in_season=true,sourcing_type='fresh',product_family='Strawberry',is_portioned=false,updated_at=now() where id=strawberry_id;
  end if;
  delete from public.product_variants where product_id=strawberry_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (strawberry_id,'1 Pack','1 Pack','pack',6019,10,'1 pack','pack',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (strawberry_id,'5 Packs','5 Packs','pack',29669,10,'5 packs','pack',5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (strawberry_id,'10 Packs','10 Packs','pack',59229,10,'10 packs','pack',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (strawberry_id,'20 Packs','20 Packs','pack',118349,10,'20 packs','pack',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');
  if not exists (select 1 from public.product_images where product_id=strawberry_id) then
    insert into public.product_images (product_id,variant_id,image_url,alt_text,position,is_primary,original_url) values (strawberry_id,null,strawberry_url,'Nigerian strawberry pack',1,true,strawberry_url);
  end if;

  select id into ijebu_garri_id from public.products where name='Garri (Ijebu)' or sku='PREMIUM-IJEBU-GARRI-50KG' order by case when sku='PREMIUM-IJEBU-GARRI-50KG' then 0 else 1 end, id limit 1;
  if ijebu_garri_id is null then raise exception 'Ijebu garri product not found'; end if;
  update public.products set name='Premium Ijebu Garri',local_name='Garri - Ijebu Premium',sku='PREMIUM-IJEBU-GARRI-50KG',description='Premium Ijebu garri sold through fixed local-measurement and bag-size options.',category_id=grains_category_id,product_family='Garri',sourcing_type='staple',is_active=true,in_season=true,is_portioned=true,source_pack_quantity=50,source_pack_unit='kg',updated_at=now() where id=ijebu_garri_id;
  delete from public.product_variants where product_id=ijebu_garri_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (ijebu_garri_id,'Half Derica (300g)','Half Derica (300g)','pack',769,0,'300g','kg',0.3,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Derica'),
    (ijebu_garri_id,'1 Derica (600g)','1 Derica (600g)','pack',1439,0,'600g','kg',0.6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Derica'),
    (ijebu_garri_id,'1kg','1kg','pack',2329,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (ijebu_garri_id,'1 Paint Bucket (3kg)','1 Paint Bucket (3kg)','pack',6789,0,'3kg','kg',3,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket'),
    (ijebu_garri_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',25459,0,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (ijebu_garri_id,'Half Bag (25kg)','Half Bag (25kg)','pack',50809,0,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (ijebu_garri_id,'1 Bag (50kg)','1 Bag (50kg)','pack',101519,0,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  select id into yam_flour_id from public.products where sku in ('M05-PAN-YAM-FLOUR','YAM-FLOUR-ELUBO-ISU') or name='Yam Flour (Elubo)' order by case when sku='YAM-FLOUR-ELUBO-ISU' then 0 else 1 end, id limit 1;
  if yam_flour_id is null then raise exception 'Yam flour product not found'; end if;
  update public.products set name='Yam Flour (Elubo Isu)',local_name='Elubo Isu',sku='YAM-FLOUR-ELUBO-ISU',description='Yam flour, locally known as Elubo Isu, sold through fixed weight and bucket options.',category_id=pantry_category_id,product_family='Swallow Flours',sourcing_type='staple',is_active=true,in_season=true,is_portioned=true,source_pack_quantity=null,source_pack_unit=null,updated_at=now() where id=yam_flour_id;
  delete from public.product_variants where product_id=yam_flour_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (yam_flour_id,'500g','500g','pack',1579,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (yam_flour_id,'1kg','1kg','pack',3049,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (yam_flour_id,'Half Bucket (1.7kg)','Half Bucket (1.7kg)','pack',4969,10,'1.7kg','kg',1.7,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bucket'),
    (yam_flour_id,'1 Bucket (3.4kg)','1 Bucket (3.4kg)','pack',9829,10,'3.4kg','kg',3.4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bucket');

  select id into sweet_potato_id from public.products where name='Sweet Potatoes' or sku='SWEET-POTATO-100KG' order by case when sku='SWEET-POTATO-100KG' then 0 else 1 end, id limit 1;
  if sweet_potato_id is null then raise exception 'Sweet potato product not found'; end if;
  update public.products set name='Sweet Potato',local_name='Potato - Sweet',sku='SWEET-POTATO-100KG',description='Fresh sweet potatoes sold through fixed kilogram, paint-bucket, and bag-size options.',category_id=tubers_category_id,product_family='Tubers',sourcing_type='fresh',is_active=true,in_season=true,is_portioned=true,source_pack_quantity=100,source_pack_unit='kg',updated_at=now() where id=sweet_potato_id;
  delete from public.product_variants where product_id=sweet_potato_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (sweet_potato_id,'1kg','1kg','pack',1349,10,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (sweet_potato_id,'1 Paint Bucket (3.5kg)','1 Paint Bucket (3.5kg)','pack',2979,10,'3.5kg','kg',3.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket'),
    (sweet_potato_id,'10kg','10kg','pack',7599,10,'10kg','kg',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (sweet_potato_id,'Quarter Bag (25kg)','Quarter Bag (25kg)','pack',29789,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (sweet_potato_id,'Half Bag (50kg)','Half Bag (50kg)','pack',57099,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (sweet_potato_id,'1 Bag (100kg)','1 Bag (100kg)','pack',114099,10,'100kg','kg',100,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  select id into yellow_garri_id from public.products where sku='YELLOW-GARRI-50KG' limit 1;
  if yellow_garri_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Yellow Garri','Garri - Yellow','YELLOW-GARRI-50KG','Yellow garri sold through fixed local-measurement and bag-size options.',grains_category_id,yellow_garri_url,true,true,'staple','Garri',50,'kg',true,now(),now()) returning id into yellow_garri_id;
  else
    update public.products set name='Yellow Garri',local_name='Garri - Yellow',description='Yellow garri sold through fixed local-measurement and bag-size options.',category_id=grains_category_id,main_image_url=yellow_garri_url,is_active=true,in_season=true,sourcing_type='staple',product_family='Garri',source_pack_quantity=50,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=yellow_garri_id;
  end if;
  delete from public.product_variants where product_id=yellow_garri_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (yellow_garri_id,'1 Derica (600g)','1 Derica (600g)','pack',859,0,'600g','kg',0.6,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Derica'),
    (yellow_garri_id,'1kg','1kg','pack',1459,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (yellow_garri_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',16639,0,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (yellow_garri_id,'Half Bag (25kg)','Half Bag (25kg)','pack',33179,0,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (yellow_garri_id,'1 Bag (50kg)','1 Bag (50kg)','pack',66249,0,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');
  if not exists (select 1 from public.product_images where product_id=yellow_garri_id) then
    insert into public.product_images (product_id,variant_id,image_url,alt_text,position,is_primary,original_url) values (yellow_garri_id,null,yellow_garri_url,'Yellow garri',1,true,yellow_garri_url);
  end if;

  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (orange_id,p_market_id,'Orange - Semi-ripe (Medium)',true),
    (avocado_id,p_market_id,'Avocado',true),
    (star_apple_id,p_market_id,'Agbalumo or Star Apple',true),
    (strawberry_id,p_market_id,'Strawberry - Nigerian',true),
    (ijebu_garri_id,p_market_id,'Garri - Ijebu Premium',true),
    (yam_flour_id,p_market_id,'Yam Flour or Elubo Isu',true),
    (sweet_potato_id,p_market_id,'Potato - Sweet',true),
    (yellow_garri_id,p_market_id,'Garri - Yellow',true)
  on conflict (product_id,market_id) do update set local_name=excluded.local_name,is_listed=true;
end
$$;;
