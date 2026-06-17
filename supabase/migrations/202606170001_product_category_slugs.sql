alter table public.product_categories
add column if not exists slug text;

create unique index if not exists product_categories_slug_key
on public.product_categories (slug);

update public.product_categories
set slug = lower(regexp_replace(regexp_replace(trim(name), '&', ' ', 'g'), '[^a-zA-Z0-9]+', '-', 'g'))
where nullif(trim(coalesce(slug, '')), '') is null
  and nullif(trim(coalesce(name, '')), '') is not null;

update public.product_categories
set slug = regexp_replace(regexp_replace(slug, '-+', '-', 'g'), '(^-|-$)', '', 'g')
where slug is not null;
