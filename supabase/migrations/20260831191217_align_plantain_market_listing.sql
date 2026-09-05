-- Keep market-specific catalogue labels and listing flags aligned with the
-- consolidated Plantain product.
update public.product_markets pm
set local_name = 'Plantain'
from public.products p
where pm.product_id = p.id
  and p.name = 'Plantain'
  and p.is_active;

update public.product_markets pm
set is_listed = false
from public.products p
where pm.product_id = p.id
  and not p.is_active
  and (p.name in ('Plantain - Small', 'Plantain - Large')
    or p.sku in ('PLANTAIN-SMALL', 'PLANTAIN-LARGE'));
