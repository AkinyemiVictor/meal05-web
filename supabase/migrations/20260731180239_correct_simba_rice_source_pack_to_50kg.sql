update public.products
set
  sku = 'SIMBA-RICE-50KG',
  description = 'Simba branded rice supplied in a 50 kg source bag and sold in measured portions. The standard customer portion is 1 Congo, equivalent to 1.5 kg.',
  source_pack_quantity = 50,
  source_pack_unit = 'kg',
  updated_at = now()
where id = 954
  and name = 'Simba Rice';;
