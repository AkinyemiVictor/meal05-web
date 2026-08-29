do $$
declare
  p_market_id uuid := public.default_market_id();
  vegetables_id bigint;
  fruits_id bigint;
  meat_id bigint;
  fish_id bigint;
  tubers_id bigint;
  tomato_id bigint;
  hake_id bigint;
  pineapple_id bigint;
  cucumber_id bigint;
  broiler_id bigint;
  mixed_pepper_id bigint;
  beef_id bigint;
  irish_id bigint;
  oloyin_id bigint;
  frozen_broiler_id bigint;
  source_image record;
begin
  select id into vegetables_id from public.product_categories where name='Vegetables' limit 1;
  select id into fruits_id from public.product_categories where name='Fruits' limit 1;
  select id into meat_id from public.product_categories where name='Meat & Poultry' limit 1;
  select id into fish_id from public.product_categories where name='Fish & Seafood' limit 1;
  select id into tubers_id from public.product_categories where name='Tubers & Legumes' limit 1;

  if vegetables_id is null or fruits_id is null or meat_id is null or fish_id is null or tubers_id is null then
    raise exception 'One or more required product categories were not found';
  end if;

  -- Fresh Tomato - Grade B
  select id into tomato_id from public.products
  where sku='FRESH-TOMATO-GRADE-B' or name='Tomatoes'
  order by case when sku='FRESH-TOMATO-GRADE-B' then 0 else 1 end, id limit 1;

  if tomato_id is null then
    insert into public.products (
      name, local_name, sku, description, category_id, is_active, in_season,
      sourcing_type, product_family, source_pack_quantity, source_pack_unit,
      is_portioned, created_at, updated_at
    ) values (
      'Fresh Tomato - Grade B', 'Tomato - Grade B', 'FRESH-TOMATO-GRADE-B',
      'Grade B fresh tomatoes sold through fixed weight and basket options.',
      vegetables_id, true, true, 'fresh', 'Fresh Tomato - Grade B', 50, 'kg', true, now(), now()
    ) returning id into tomato_id;
  else
    update public.products set
      name='Fresh Tomato - Grade B', local_name='Tomato - Grade B', sku='FRESH-TOMATO-GRADE-B',
      description='Grade B fresh tomatoes sold through fixed weight and basket options.',
      category_id=vegetables_id, is_active=true, in_season=true, sourcing_type='fresh',
      product_family='Fresh Tomato - Grade B', source_pack_quantity=50, source_pack_unit='kg',
      is_portioned=true, updated_at=now()
    where id=tomato_id;
  end if;

  delete from public.product_variants where product_id=tomato_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent,grade
  ) values
    (tomato_id,'500g','500g','pack',819,0,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'B'),
    (tomato_id,'1kg','1kg','pack',1329,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null,'B'),
    (tomato_id,'Half Paint Bucket (1.75kg)','Half Paint Bucket (1.75kg)','pack',4699,0,'1.75kg','kg',1.75,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Paint Bucket','B'),
    (tomato_id,'1 Paint Bucket (3.5kg)','1 Paint Bucket (3.5kg)','pack',5109,0,'3.5kg','kg',3.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket','B'),
    (tomato_id,'Quarter Basket (12.5kg)','Quarter Basket (12.5kg)','pack',17979,0,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Basket','B'),
    (tomato_id,'Half Basket (25kg)','Half Basket (25kg)','pack',46199,0,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Basket','B'),
    (tomato_id,'1 Basket (50kg)','1 Basket (50kg)','pack',71599,0,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Basket','B');

  -- Smoked Hake Fish
  select id into hake_id from public.products
  where sku='SMOKED-HAKE-FISH' or lower(name)='smoked hake fish' limit 1;

  if hake_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Smoked Hake Fish','Smoked Hake Fish','SMOKED-HAKE-FISH',
      'Smoked hake fish sold through fixed piece-count options.',fish_id,true,true,'fresh',
      'Smoked Fish',20,'piece',false,now(),now()
    ) returning id into hake_id;
  else
    update public.products set
      name='Smoked Hake Fish',local_name='Smoked Hake Fish',sku='SMOKED-HAKE-FISH',
      description='Smoked hake fish sold through fixed piece-count options.',category_id=fish_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Smoked Fish',
      source_pack_quantity=20,source_pack_unit='piece',is_portioned=false,updated_at=now()
    where id=hake_id;
  end if;

  delete from public.product_variants where product_id=hake_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (hake_id,'5 Pieces','5 Pieces','pack',2259,0,'5 pieces','piece',5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (hake_id,'10 Pieces','10 Pieces','pack',4409,0,'10 pieces','piece',10,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (hake_id,'20 Pieces','20 Pieces','pack',8719,0,'20 pieces','piece',20,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Pineapple - Semi-Ripe (Big)
  select id into pineapple_id from public.products
  where sku='PINEAPPLE-SEMI-RIPE-BIG' or name='Pineapple'
  order by case when sku='PINEAPPLE-SEMI-RIPE-BIG' then 0 else 1 end,id limit 1;

  if pineapple_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Pineapple - Semi-Ripe (Big)','Pineapple - Semi-ripe (Big)','PINEAPPLE-SEMI-RIPE-BIG',
      'Big semi-ripe pineapples sold through fixed piece-count options.',fruits_id,true,true,'fresh',
      'Pineapple - Semi-Ripe Big',12,'piece',false,now(),now()
    ) returning id into pineapple_id;
  else
    update public.products set
      name='Pineapple - Semi-Ripe (Big)',local_name='Pineapple - Semi-ripe (Big)',sku='PINEAPPLE-SEMI-RIPE-BIG',
      description='Big semi-ripe pineapples sold through fixed piece-count options.',category_id=fruits_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Pineapple - Semi-Ripe Big',
      source_pack_quantity=12,source_pack_unit='piece',is_portioned=false,updated_at=now()
    where id=pineapple_id;
  end if;

  delete from public.product_variants where product_id=pineapple_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (pineapple_id,'1 Piece','1 Piece','pack',2269,10,'1 piece','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (pineapple_id,'Half Dozen (6 Pieces)','Half Dozen (6 Pieces)','pack',12209,10,'6 pieces','piece',6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (pineapple_id,'1 Dozen (12 Pieces)','1 Dozen (12 Pieces)','pack',24309,10,'12 pieces','piece',12,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Cucumber
  select id into cucumber_id from public.products
  where sku='CUCUMBER-38KG' or lower(name)='cucumber' limit 1;

  if cucumber_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Cucumber','Cucumber','CUCUMBER-38KG','Fresh cucumber sold through fixed kilogram and bag options.',
      vegetables_id,true,true,'fresh','Cucumber',38,'kg',true,now(),now()
    ) returning id into cucumber_id;
  else
    update public.products set
      name='Cucumber',local_name='Cucumber',sku='CUCUMBER-38KG',
      description='Fresh cucumber sold through fixed kilogram and bag options.',category_id=vegetables_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Cucumber',
      source_pack_quantity=38,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=cucumber_id;
  end if;

  delete from public.product_variants where product_id=cucumber_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (cucumber_id,'1kg','1kg','pack',1249,10,'1kg','kg',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (cucumber_id,'Quarter Bag (9.5kg)','Quarter Bag (9.5kg)','pack',8439,10,'9.5kg','kg',9.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (cucumber_id,'Half Bag (19kg)','Half Bag (19kg)','pack',16779,10,'19kg','kg',19,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (cucumber_id,'1 Bag (38kg)','1 Bag (38kg)','pack',33449,10,'38kg','kg',38,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Processed Broiler Chicken, separate from frozen broiler chicken
  select id into broiler_id from public.products
  where sku='PROCESSED-BROILER-CHICKEN' or lower(name)='processed broiler chicken' limit 1;
  select id into frozen_broiler_id from public.products where sku='FROZEN-BROILER-CHICKEN-10KG' limit 1;

  if broiler_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,main_image_url,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Processed Broiler Chicken','Chicken - Broiler','PROCESSED-BROILER-CHICKEN',
      'One whole processed broiler chicken sold as a fixed item.',meat_id,
      (select main_image_url from public.products where id=frozen_broiler_id),
      true,true,'fresh','Whole Chicken',1,'piece',false,now(),now()
    ) returning id into broiler_id;
  else
    update public.products set
      name='Processed Broiler Chicken',local_name='Chicken - Broiler',sku='PROCESSED-BROILER-CHICKEN',
      description='One whole processed broiler chicken sold as a fixed item.',category_id=meat_id,
      main_image_url=coalesce(main_image_url,(select main_image_url from public.products where id=frozen_broiler_id)),
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Whole Chicken',
      source_pack_quantity=1,source_pack_unit='piece',is_portioned=false,updated_at=now()
    where id=broiler_id;
  end if;

  delete from public.product_variants where product_id=broiler_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (broiler_id,'1 Whole Chicken','1 Whole Chicken','pack',14509,10,'1 whole chicken','piece',1,true,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  if frozen_broiler_id is not null and not exists (select 1 from public.product_images where product_id=broiler_id) then
    select * into source_image from public.product_images where product_id=frozen_broiler_id order by is_primary desc,position,id limit 1;
    if source_image.id is not null then
      insert into public.product_images (
        product_id,variant_id,image_url,alt_text,position,is_primary,thumb_url,card_url,detail_url,original_url,
        image_width,image_height,normalized_at
      ) values (
        broiler_id,null,source_image.image_url,'Processed broiler chicken',1,true,
        source_image.thumb_url,source_image.card_url,source_image.detail_url,source_image.original_url,
        source_image.image_width,source_image.image_height,source_image.normalized_at
      );
    end if;
  end if;

  -- Mixed Bell Peppers
  select id into mixed_pepper_id from public.products
  where sku='MIXED-BELL-PEPPERS' or lower(name) in ('mixed bell peppers','bell pepper (mixed)') limit 1;

  if mixed_pepper_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Mixed Bell Peppers','Bell Pepper (Mixed)','MIXED-BELL-PEPPERS',
      'Mixed-colour bell peppers sold through fixed weight options.',vegetables_id,true,true,'fresh',
      'Bell Pepper',2,'kg',true,now(),now()
    ) returning id into mixed_pepper_id;
  else
    update public.products set
      name='Mixed Bell Peppers',local_name='Bell Pepper (Mixed)',sku='MIXED-BELL-PEPPERS',
      description='Mixed-colour bell peppers sold through fixed weight options.',category_id=vegetables_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Bell Pepper',
      source_pack_quantity=2,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=mixed_pepper_id;
  end if;

  delete from public.product_variants where product_id=mixed_pepper_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (mixed_pepper_id,'250g','250g','pack',3849,0,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (mixed_pepper_id,'500g','500g','pack',7599,0,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (mixed_pepper_id,'1kg','1kg','pack',15099,0,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (mixed_pepper_id,'2kg','2kg','pack',30099,0,'2kg','kg',2,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Boneless Beef
  select id into beef_id from public.products
  where sku='BONELESS-BEEF' or name='Beef Boneless Cuts'
  order by case when sku='BONELESS-BEEF' then 0 else 1 end,id limit 1;

  if beef_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Boneless Beef','Cow Meat or Beef - Boneless','BONELESS-BEEF',
      'Boneless beef sold through fixed weight options.',meat_id,true,true,'fresh','Beef',1,'kg',true,now(),now()
    ) returning id into beef_id;
  else
    update public.products set
      name='Boneless Beef',local_name='Cow Meat or Beef - Boneless',sku='BONELESS-BEEF',
      description='Boneless beef sold through fixed weight options.',category_id=meat_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Beef',
      source_pack_quantity=1,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=beef_id;
  end if;

  delete from public.product_variants where product_id=beef_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role
  ) values
    (beef_id,'500g','500g','pack',5529,10,'500g','kg',0.5,true,true,p_market_id,'NGN','fixed',1,null,1,'standard'),
    (beef_id,'1kg','1kg','pack',10459,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard');

  -- Irish Potato
  select id into irish_id from public.products
  where sku='IRISH-POTATO-100KG' or name='Irish Potatoes'
  order by case when sku='IRISH-POTATO-100KG' then 0 else 1 end,id limit 1;

  if irish_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Irish Potato','Potato - Irish','IRISH-POTATO-100KG','Irish potatoes sold through fixed weight and bag options.',
      tubers_id,true,true,'fresh','Tubers',100,'kg',true,now(),now()
    ) returning id into irish_id;
  else
    update public.products set
      name='Irish Potato',local_name='Potato - Irish',sku='IRISH-POTATO-100KG',
      description='Irish potatoes sold through fixed weight and bag options.',category_id=tubers_id,
      is_active=true,in_season=true,sourcing_type='fresh',product_family='Tubers',
      source_pack_quantity=100,source_pack_unit='kg',is_portioned=true,updated_at=now()
    where id=irish_id;
  end if;

  delete from public.product_variants where product_id=irish_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (irish_id,'250g','250g','pack',979,10,'250g','kg',0.25,true,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (irish_id,'500g','500g','pack',1859,10,'500g','kg',0.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (irish_id,'1kg','1kg','pack',3619,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (irish_id,'1 Paint Bucket (4kg)','1 Paint Bucket (4kg)','pack',13739,10,'4kg','kg',4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Paint Bucket'),
    (irish_id,'Quarter Bag (25kg)','Quarter Bag (25kg)','pack',66309,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (irish_id,'Half Bag (50kg)','Half Bag (50kg)','pack',132399,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (irish_id,'1 Bag (100kg)','1 Bag (100kg)','pack',264579,10,'100kg','kg',100,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Maiduguri Honey Beans (Oloyin)
  select id into oloyin_id from public.products
  where sku='MAIDUGURI-HONEY-BEANS-OLOYIN-50KG' or name='Beans (Oloyin)'
  order by case when sku='MAIDUGURI-HONEY-BEANS-OLOYIN-50KG' then 0 else 1 end,id limit 1;

  if oloyin_id is null then
    insert into public.products (
      name,local_name,sku,description,category_id,is_active,in_season,sourcing_type,
      product_family,source_pack_quantity,source_pack_unit,is_portioned,created_at,updated_at
    ) values (
      'Maiduguri Honey Beans (Oloyin)','Beans - Oloyin Maiduguri','MAIDUGURI-HONEY-BEANS-OLOYIN-50KG',
      'Maiduguri honey beans, locally known as Oloyin, sold through fixed measurement and bag options.',
      tubers_id,true,true,'staple','Beans and Legumes',50,'kg',true,now(),now()
    ) returning id into oloyin_id;
  else
    update public.products set
      name='Maiduguri Honey Beans (Oloyin)',local_name='Beans - Oloyin Maiduguri',
      sku='MAIDUGURI-HONEY-BEANS-OLOYIN-50KG',
      description='Maiduguri honey beans, locally known as Oloyin, sold through fixed measurement and bag options.',
      category_id=tubers_id,is_active=true,in_season=true,sourcing_type='staple',
      product_family='Beans and Legumes',source_pack_quantity=50,source_pack_unit='kg',
      is_portioned=true,updated_at=now()
    where id=oloyin_id;
  end if;

  delete from public.product_variants where product_id=oloyin_id;
  insert into public.product_variants (
    product_id,name,display_label,unit,price,stock_count,size,base_unit,base_quantity,
    is_default,is_active,market_id,currency_code,purchase_mode,min_quantity,max_quantity,
    step_quantity,option_role,local_measurement_equivalent
  ) values
    (oloyin_id,'Half Derica (300g)','Half Derica (300g)','pack',669,10,'300g','kg',0.3,true,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Derica'),
    (oloyin_id,'1 Derica (600g)','1 Derica (600g)','pack',1239,10,'600g','kg',0.6,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Derica'),
    (oloyin_id,'1kg','1kg','pack',1929,10,'1kg','kg',1,false,true,p_market_id,'NGN','fixed',1,null,1,'standard',null),
    (oloyin_id,'1 Congo (1.4kg)','1 Congo (1.4kg)','pack',2659,10,'1.4kg','kg',1.4,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Congo'),
    (oloyin_id,'Quarter Bag (12.5kg)','Quarter Bag (12.5kg)','pack',21819,10,'12.5kg','kg',12.5,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Quarter Bag'),
    (oloyin_id,'Half Bag (25kg)','Half Bag (25kg)','pack',43529,10,'25kg','kg',25,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','Half Bag'),
    (oloyin_id,'1 Bag (50kg)','1 Bag (50kg)','pack',86859,10,'50kg','kg',50,false,true,p_market_id,'NGN','fixed',1,null,1,'standard','1 Bag');

  -- Ensure all products are listed in the default market.
  insert into public.product_markets (product_id,market_id,local_name,is_listed)
  values
    (tomato_id,p_market_id,'Tomato - Grade B',true),
    (hake_id,p_market_id,'Smoked Hake Fish',true),
    (pineapple_id,p_market_id,'Pineapple - Semi-ripe (Big)',true),
    (cucumber_id,p_market_id,'Cucumber',true),
    (broiler_id,p_market_id,'Chicken - Broiler',true),
    (mixed_pepper_id,p_market_id,'Bell Pepper (Mixed)',true),
    (beef_id,p_market_id,'Cow Meat or Beef - Boneless',true),
    (irish_id,p_market_id,'Potato - Irish',true),
    (oloyin_id,p_market_id,'Beans - Oloyin Maiduguri',true)
  on conflict (product_id,market_id)
  do update set local_name=excluded.local_name,is_listed=true;
end
$$;;
