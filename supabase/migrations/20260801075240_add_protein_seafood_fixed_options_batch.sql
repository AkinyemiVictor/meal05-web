do $$
declare
  fish_category_id bigint;
  meat_category_id bigint;
  market_id_value uuid;
  pollock_id bigint;
  goat_head_id bigint;
  goat_bone_id bigint;
  chicken_id bigint;
  tripe_id bigint;
  snail_small_id bigint;
  snail_big_id bigint;
  smoked_catfish_id bigint;
  catfish_medium_id bigint;
  catfish_big_id bigint;
  pollock_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Merluccius%20Merluccius%20(Panla).png';
  goat_head_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Goat%20Head%20-%20%20Isiawu.png';
  goat_bone_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Assorted%20Goat%20Meat.png';
  chicken_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Whole%20Chicken.png';
  tripe_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Ruminant%20Stripe%20(Shaki).png';
  snail_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Snail.png';
  catfish_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/Cat%20Fish.png';
  smoked_catfish_image text := 'https://dzkrcmyupeerlbhshwgd.supabase.co/storage/v1/object/public/product-images/873/gallery/batch2-20260726-smoked-catfish-variant-1/original.png';
begin
  market_id_value := public.default_market_id();
  select id into fish_category_id from public.product_categories where slug='fish-seafood' limit 1;
  select id into meat_category_id from public.product_categories where slug='meat-poultry' limit 1;

  if fish_category_id is null or meat_category_id is null then
    raise exception 'Required protein categories were not found';
  end if;

  -- Alaska Pollock (Panla Osun)
  select id into pollock_id from public.products
  where sku='ALASKA-POLLOCK-PANLA-OSUN-15KG' or name='Panla (Hake/Whiting)'
  order by case when sku='ALASKA-POLLOCK-PANLA-OSUN-15KG' then 0 else 1 end, id limit 1;
  if pollock_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Alaska Pollock (Panla Osun)','Panla Osun','ALASKA-POLLOCK-PANLA-OSUN-15KG','Frozen Alaska pollock sold through fixed weight and carton options.',fish_category_id,pollock_image,true,true,'fresh','Frozen Fish',15,'kg',true,now(),now())
    returning id into pollock_id;
  else
    update public.products set name='Alaska Pollock (Panla Osun)',local_name='Panla Osun',sku='ALASKA-POLLOCK-PANLA-OSUN-15KG',description='Frozen Alaska pollock sold through fixed weight and carton options.',category_id=fish_category_id,main_image_url=coalesce(main_image_url,pollock_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Frozen Fish',source_pack_quantity=15,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=pollock_id;
  end if;
  delete from public.product_variants where product_id=pollock_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (pollock_id,'1kg','1kg','pack',3999,10,'1kg','kg',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard',null),
    (pollock_id,'Quarter Carton (3.75kg)','Quarter Carton (3.75kg)','carton',16589,10,'3.75kg','kg',3.75,false,true,market_id_value,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (pollock_id,'Half Carton (7.5kg)','Half Carton (7.5kg)','carton',32569,10,'7.5kg','kg',7.5,false,true,market_id_value,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (pollock_id,'1 Carton (15kg)','1 Carton (15kg)','carton',64029,10,'15kg','kg',15,false,true,market_id_value,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Goat Head
  select id into goat_head_id from public.products where sku='GOAT-HEAD-PER-HEAD' or name='Goat Head (Isi Ewu Base)' order by case when sku='GOAT-HEAD-PER-HEAD' then 0 else 1 end,id limit 1;
  if goat_head_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Goat Head','Goat Head (Per Head)','GOAT-HEAD-PER-HEAD','Whole goat head sold per head. Cutting services are handled separately.',meat_category_id,goat_head_image,true,true,'fresh','Goat Offal',false,now(),now()) returning id into goat_head_id;
  else
    update public.products set name='Goat Head',local_name='Goat Head (Per Head)',sku='GOAT-HEAD-PER-HEAD',description='Whole goat head sold per head. Cutting services are handled separately.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,goat_head_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Goat Offal',is_portioned=false,updated_at=now() where id=goat_head_id;
  end if;
  delete from public.product_variants where product_id=goat_head_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values (goat_head_id,'1 Head','1 Head','head',3309,10,'1 head','head',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Bone-in Goat Meat
  select id into goat_bone_id from public.products where sku='GOAT-MEAT-BONE-IN' limit 1;
  if goat_bone_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Bone-In Goat Meat','Goat Meat - With Bone','GOAT-MEAT-BONE-IN','Fresh goat meat with bone sold through fixed weight options.',meat_category_id,goat_bone_image,true,true,'fresh','Goat Meat',true,now(),now()) returning id into goat_bone_id;
  else
    update public.products set name='Bone-In Goat Meat',local_name='Goat Meat - With Bone',description='Fresh goat meat with bone sold through fixed weight options.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,goat_bone_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Goat Meat',is_portioned=true,updated_at=now() where id=goat_bone_id;
  end if;
  delete from public.product_variants where product_id=goat_bone_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (goat_bone_id,'500g','500g','pack',5479,10,'500g','kg',0.5,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (goat_bone_id,'1kg','1kg','pack',10359,10,'1kg','kg',1,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (goat_bone_id,'2kg','2kg','pack',20119,10,'2kg','kg',2,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Frozen Broiler Chicken
  select id into chicken_id from public.products where sku='FROZEN-BROILER-CHICKEN-10KG' or name='Whole Chicken' order by case when sku='FROZEN-BROILER-CHICKEN-10KG' then 0 else 1 end,id limit 1;
  if chicken_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at)
    values ('Frozen Broiler Chicken',null,'FROZEN-BROILER-CHICKEN-10KG','Frozen whole broiler chicken sold through fixed bird and carton options.',meat_category_id,chicken_image,true,true,'fresh','Frozen Chicken',10,'kg',true,now(),now()) returning id into chicken_id;
  else
    update public.products set name='Frozen Broiler Chicken',local_name=null,sku='FROZEN-BROILER-CHICKEN-10KG',description='Frozen whole broiler chicken sold through fixed bird and carton options.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,chicken_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Frozen Chicken',source_pack_quantity=10,source_pack_unit='kg',is_portioned=true,updated_at=now() where id=chicken_id;
  end if;
  delete from public.product_variants where product_id=chicken_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,weight_min,weight_max,weight_unit,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role,local_measurement_equivalent)
  values
    (chicken_id,'900g-1kg','900g-1kg','bird',5979,10,'900g-1kg','kg',null,0.9,1,'kg',true,true,market_id_value,'NGN','fixed',1,null,1,'standard',null),
    (chicken_id,'Quarter Carton (2.25-2.5kg)','Quarter Carton (2.25-2.5kg)','carton',14039,10,'2.25-2.5kg','kg',null,2.25,2.5,'kg',false,true,market_id_value,'NGN','fixed',1,null,1,'standard','Quarter Carton'),
    (chicken_id,'Half Carton (4.5-5kg)','Half Carton (4.5-5kg)','carton',27479,10,'4.5-5kg','kg',null,4.5,5,'kg',false,true,market_id_value,'NGN','fixed',1,null,1,'standard','Half Carton'),
    (chicken_id,'1 Carton (9-10kg)','1 Carton (9-10kg)','carton',53859,10,'9-10kg','kg',null,9,10,'kg',false,true,market_id_value,'NGN','fixed',1,null,1,'standard','1 Carton');

  -- Beef Tripe / Shaki
  select id into tripe_id from public.products where sku='BEEF-TRIPE-SHAKI' or name='Shaki (Tripe)' order by case when sku='BEEF-TRIPE-SHAKI' then 0 else 1 end,id limit 1;
  if tripe_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Beef Tripe (Shaki)','Shaki','BEEF-TRIPE-SHAKI','Cleaned beef tripe sold through fixed weight options.',meat_category_id,tripe_image,true,true,'fresh','Beef Offal',true,now(),now()) returning id into tripe_id;
  else
    update public.products set name='Beef Tripe (Shaki)',local_name='Shaki',sku='BEEF-TRIPE-SHAKI',description='Cleaned beef tripe sold through fixed weight options.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,tripe_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Beef Offal',is_portioned=true,updated_at=now() where id=tripe_id;
  end if;
  delete from public.product_variants where product_id=tripe_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (tripe_id,'500g','500g','pack',6919,10,'500g','kg',0.5,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (tripe_id,'1kg','1kg','pack',13229,10,'1kg','kg',1,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Snails Small
  select id into snail_small_id from public.products where sku='SNAILS-SMALL' limit 1;
  if snail_small_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Snails - Small',null,'SNAILS-SMALL','Small edible snails sold through fixed piece-count options.',meat_category_id,snail_image,true,true,'fresh','Snails',false,now(),now()) returning id into snail_small_id;
  else
    update public.products set name='Snails - Small',description='Small edible snails sold through fixed piece-count options.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,snail_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Snails',is_portioned=false,updated_at=now() where id=snail_small_id;
  end if;
  delete from public.product_variants where product_id=snail_small_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (snail_small_id,'1 Piece','1 Piece','pack',1169,10,'1 piece','piece',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_small_id,'4 Pieces','4 Pieces','pack',4259,10,'4 pieces','piece',4,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_small_id,'5 Pieces','5 Pieces','pack',5429,10,'5 pieces','piece',5,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_small_id,'10 Pieces','10 Pieces','pack',10749,10,'10 pieces','piece',10,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_small_id,'20 Pieces','20 Pieces','pack',21399,10,'20 pieces','piece',20,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Snails Big
  select id into snail_big_id from public.products where sku='SNAILS-BIG' limit 1;
  if snail_big_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Snails - Big',null,'SNAILS-BIG','Big edible snails sold through fixed piece-count options.',meat_category_id,snail_image,true,true,'fresh','Snails',false,now(),now()) returning id into snail_big_id;
  else
    update public.products set name='Snails - Big',description='Big edible snails sold through fixed piece-count options.',category_id=meat_category_id,main_image_url=coalesce(main_image_url,snail_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Snails',is_portioned=false,updated_at=now() where id=snail_big_id;
  end if;
  delete from public.product_variants where product_id=snail_big_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (snail_big_id,'1 Piece','1 Piece','pack',2899,10,'1 piece','piece',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_big_id,'5 Pieces','5 Pieces','pack',12069,10,'5 pieces','piece',5,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_big_id,'10 Pieces','10 Pieces','pack',23539,10,'10 pieces','piece',10,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (snail_big_id,'20 Pieces','20 Pieces','pack',46469,10,'20 pieces','piece',20,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Smoked Farmed Catfish Medium
  select id into smoked_catfish_id from public.products where sku='SMOKED-FARMED-CATFISH-MEDIUM' or name='Smoked Catfish' order by case when sku='SMOKED-FARMED-CATFISH-MEDIUM' then 0 else 1 end,id limit 1;
  if smoked_catfish_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Smoked Farmed Catfish - Medium','Smoked Catfish - Agric (Medium)','SMOKED-FARMED-CATFISH-MEDIUM','Medium farm-raised smoked catfish sold through fixed piece-count options.',fish_category_id,smoked_catfish_image,true,true,'fresh','Smoked Fish',false,now(),now()) returning id into smoked_catfish_id;
  else
    update public.products set name='Smoked Farmed Catfish - Medium',local_name='Smoked Catfish - Agric (Medium)',sku='SMOKED-FARMED-CATFISH-MEDIUM',description='Medium farm-raised smoked catfish sold through fixed piece-count options.',category_id=fish_category_id,main_image_url=coalesce(main_image_url,smoked_catfish_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Smoked Fish',is_portioned=false,updated_at=now() where id=smoked_catfish_id;
  end if;
  delete from public.product_variants where product_id=smoked_catfish_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (smoked_catfish_id,'1 Piece','1 Piece','pack',1489,10,'1 piece','piece',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (smoked_catfish_id,'5 Pieces','5 Pieces','pack',5879,10,'5 pieces','piece',5,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (smoked_catfish_id,'10 Pieces','10 Pieces','pack',11659,10,'10 pieces','piece',10,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (smoked_catfish_id,'20 Pieces','20 Pieces','pack',23219,10,'20 pieces','piece',20,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Fresh Processed Catfish Medium (reuse generic Catfish)
  select id into catfish_medium_id from public.products where sku='FRESH-PROCESSED-CATFISH-MEDIUM' or name='Catfish' order by case when sku='FRESH-PROCESSED-CATFISH-MEDIUM' then 0 else 1 end,id limit 1;
  if catfish_medium_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Fresh Processed Catfish - Medium',null,'FRESH-PROCESSED-CATFISH-MEDIUM','Medium fresh catfish, cleaned and processed, sold through fixed piece-count options.',fish_category_id,catfish_image,true,true,'fresh','Fresh Catfish',false,now(),now()) returning id into catfish_medium_id;
  else
    update public.products set name='Fresh Processed Catfish - Medium',local_name=null,sku='FRESH-PROCESSED-CATFISH-MEDIUM',description='Medium fresh catfish, cleaned and processed, sold through fixed piece-count options.',category_id=fish_category_id,main_image_url=coalesce(main_image_url,catfish_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Fresh Catfish',is_portioned=false,updated_at=now() where id=catfish_medium_id;
  end if;
  delete from public.product_variants where product_id=catfish_medium_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (catfish_medium_id,'1 Piece','1 Piece','pack',4049,10,'1 piece','piece',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (catfish_medium_id,'Half Dozen','Half Dozen','pack',21299,10,'6 pieces','piece',6,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (catfish_medium_id,'1 Dozen','1 Dozen','pack',41999,10,'12 pieces','piece',12,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- Fresh Processed Catfish Big
  select id into catfish_big_id from public.products where sku='FRESH-PROCESSED-CATFISH-BIG' limit 1;
  if catfish_big_id is null then
    insert into public.products (name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,product_family,is_portioned,created_at,updated_at)
    values ('Fresh Processed Catfish - Big',null,'FRESH-PROCESSED-CATFISH-BIG','Big fresh catfish, cleaned and processed, sold through fixed piece-count options.',fish_category_id,catfish_image,true,true,'fresh','Fresh Catfish',false,now(),now()) returning id into catfish_big_id;
  else
    update public.products set name='Fresh Processed Catfish - Big',description='Big fresh catfish, cleaned and processed, sold through fixed piece-count options.',category_id=fish_category_id,main_image_url=coalesce(main_image_url,catfish_image),is_active=true,in_season=true,sourcing_type='fresh',product_family='Fresh Catfish',is_portioned=false,updated_at=now() where id=catfish_big_id;
  end if;
  delete from public.product_variants where product_id=catfish_big_id;
  insert into public.product_variants (product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,step_quantity,option_role)
  values
    (catfish_big_id,'1 Piece','1 Piece','pack',6349,10,'1 piece','piece',1,true,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (catfish_big_id,'Half Dozen','Half Dozen','pack',35099,10,'6 pieces','piece',6,false,true,market_id_value,'NGN','fixed',1,null,1,'standard'),
    (catfish_big_id,'1 Dozen','1 Dozen','pack',69599,10,'12 pieces','piece',12,false,true,market_id_value,'NGN','fixed',1,null,1,'standard');

  -- List all products in default market.
  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (pollock_id,market_id_value,'Alaska Pollock (Panla Osun)',true),
    (goat_head_id,market_id_value,'Goat Head (Per Head)',true),
    (goat_bone_id,market_id_value,'Goat Meat - With Bone',true),
    (chicken_id,market_id_value,'Frozen Chicken - Broiler',true),
    (tripe_id,market_id_value,'Shaki or Beef Tripe',true),
    (snail_small_id,market_id_value,'Snails (Small)',true),
    (snail_big_id,market_id_value,'Snails (Big)',true),
    (smoked_catfish_id,market_id_value,'Smoked Catfish - Agric (Medium)',true),
    (catfish_medium_id,market_id_value,'Fresh Catfish - Freshly Processed (Medium)',true),
    (catfish_big_id,market_id_value,'Fresh Catfish - Freshly Processed (Big)',true)
  on conflict (product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;

  -- Add basic image rows when newly created products have none.
  if not exists (select 1 from public.product_images where product_id=goat_bone_id) then
    insert into public.product_images (product_id,image_url,original_url,alt_text,position,is_primary)
    values (goat_bone_id,goat_bone_image,goat_bone_image,'Bone-in goat meat',1,true);
  end if;
  if not exists (select 1 from public.product_images where product_id=snail_small_id) then
    insert into public.product_images (product_id,image_url,original_url,alt_text,position,is_primary)
    values (snail_small_id,snail_image,snail_image,'Small snails',1,true);
  end if;
  if not exists (select 1 from public.product_images where product_id=snail_big_id) then
    insert into public.product_images (product_id,image_url,original_url,alt_text,position,is_primary)
    values (snail_big_id,snail_image,snail_image,'Big snails',1,true);
  end if;
  if not exists (select 1 from public.product_images where product_id=catfish_big_id) then
    insert into public.product_images (product_id,image_url,original_url,alt_text,position,is_primary)
    values (catfish_big_id,catfish_image,catfish_image,'Fresh processed catfish - big',1,true);
  end if;
end
$$;;
