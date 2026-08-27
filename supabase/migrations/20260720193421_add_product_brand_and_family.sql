alter table public.products
  add column if not exists brand text,
  add column if not exists product_family text;

create index if not exists idx_products_brand
  on public.products (brand)
  where brand is not null;

create index if not exists idx_products_product_family
  on public.products (product_family)
  where product_family is not null;;
