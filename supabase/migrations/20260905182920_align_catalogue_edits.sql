-- Capture the catalogue corrections that were originally applied directly to
-- production so every environment converges on the same customer-facing data.

update public.products
set name = 'Gino Magic Pepper & Onion Tomato Seasoning Paste',
    local_name = 'Gino Magic Pepper & Onion Tomato Seasoning Paste',
    description = replace(
      description,
      'Gino Magic Pepper & Onion Tomato Seasoning is',
      'Gino Magic Pepper & Onion Tomato Seasoning Paste is'
    ),
    updated_at = now()
where name in (
  'Gino Magic Pepper & Onion Tomato Seasoning',
  'Gino Magic Pepper & Onion Tomato Seasoning Paste'
);

update public.product_markets market
set local_name = product.name
from public.products product
where market.product_id = product.id
  and product.name = 'Gino Magic Pepper & Onion Tomato Seasoning Paste'
  and market.local_name is not null;

-- Preparation is not offered yet. Remove the obsolete phrase anywhere it may
-- still occur while preserving the remaining product copy.
update public.products
set name = btrim(regexp_replace(name, '\\s*-?\\s*freshly processed\\s*', ' ', 'gi')),
    local_name = case
      when local_name is null then null
      else btrim(regexp_replace(local_name, '\\s*-?\\s*freshly processed\\s*', ' ', 'gi'))
    end,
    description = case
      when description is null then null
      else btrim(regexp_replace(description, '\\s*freshly processed\\s*', ' ', 'gi'))
    end,
    updated_at = now()
where name ilike '%catfish%'
  and concat_ws(' ', name, local_name, description) ilike '%freshly processed%';

update public.product_markets market
set local_name = btrim(regexp_replace(market.local_name, '\\s*-?\\s*freshly processed\\s*', ' ', 'gi'))
from public.products product
where market.product_id = product.id
  and product.name ilike '%catfish%'
  and market.local_name ilike '%freshly processed%';

-- Retired yam choices should not remain as disabled storefront options. Keep
-- variants referenced by an order for historical integrity.
delete from public.product_variants variant
using public.products product
where variant.product_id = product.id
  and product.name ilike '%yam%'
  and not variant.is_active
  and not exists (
    select 1
    from public.order_items item
    where item.variant_id = variant.id
  );
