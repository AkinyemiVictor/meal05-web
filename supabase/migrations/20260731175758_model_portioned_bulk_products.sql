alter table public.products
  add column if not exists source_pack_quantity numeric,
  add column if not exists source_pack_unit text,
  add column if not exists is_portioned boolean not null default false;

alter table public.products
  drop constraint if exists products_source_pack_quantity_check;

alter table public.products
  add constraint products_source_pack_quantity_check
  check (source_pack_quantity is null or source_pack_quantity > 0);

comment on column public.products.source_pack_quantity is
  'Quantity of the supplier or branded source pack before customer portioning, e.g. 25.';
comment on column public.products.source_pack_unit is
  'Unit of the supplier or branded source pack, e.g. kg or litre.';
comment on column public.products.is_portioned is
  'True when the source pack is opened and sold to customers in smaller measured portions.';

update public.products
set sku = 'SIMBA-RICE-25KG',
    description = 'Simba branded rice supplied in a 25 kg source bag and sold in measured portions. The standard customer portion is 1 Congo, equivalent to 1.5 kg.',
    product_family = 'Portioned Branded Rice',
    source_pack_quantity = 25,
    source_pack_unit = 'kg',
    is_portioned = true,
    updated_at = now()
where sku = 'SIMBA-RICE-1.5KG';

update public.product_variants pv
set name = '1 Congo portion',
    unit = 'congo',
    size = '1.5 kg',
    base_unit = 'kg',
    base_quantity = 1.5,
    local_measurement_equivalent = '1 Congo',
    purchase_mode = 'fixed',
    min_quantity = 1,
    step_quantity = 1,
    updated_at = now()
from public.products p
where pv.product_id = p.id
  and p.sku = 'SIMBA-RICE-25KG'
  and pv.is_default = true;;
