do $$
begin
  if not exists (
    select 1 from public.products
    where id = 23 and name = 'Coconut (Medium)' and is_active = true
  ) then
    raise exception 'Expected canonical Coconut (Medium) product 23 to be active before consolidation';
  end if;

  if (select count(*) from public.products where id in (958, 959) and is_active = true) <> 2 then
    raise exception 'Expected Coconut Small/Big products 958 and 959 to be active before consolidation';
  end if;

  if (select count(*) from public.product_variants where product_id = 23 and is_active = true) <> 4 then
    raise exception 'Expected four active canonical Coconut quantity variants on product 23';
  end if;
end
$$;

update public.products
set
  name = 'Coconut',
  selection_model = 'flexible_market',
  variation_note = 'Fresh produce naturally varies. Size, shape, weight and number of pieces may differ depending on what is available at the farm or market. We''ll aim to match your preference while ensuring you receive the quantity or value represented by the option you paid for.'
where id = 23;

-- Retire the duplicate size-specific storefront products without deleting their
-- records, prices, variants, images, or historical order references.
update public.products
set is_active = false
where id in (958, 959);

update public.product_variants
set is_active = false
where product_id in (958, 959)
  and is_active = true;

update public.product_markets
set is_listed = false
where product_id in (958, 959)
  and is_listed = true;

-- Product 23 keeps its existing quantity/value contract:
-- 1 Piece, 2 Pieces, Half Dozen, 1 Dozen.
-- Physical coconut size is now a non-price preference handled by size_preference.
