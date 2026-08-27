-- Gallery readiness for product_images:
-- 1) is_primary flag with one-primary-per-product guarantee
-- 2) position NOT NULL + unique per product
-- 3) trigger keeps products.main_image_url synced from the primary image

-- 1. is_primary
alter table public.product_images
  add column if not exists is_primary boolean not null default false;

-- Backfill: lowest position (then lowest id) per product becomes primary
with ranked as (
  select id,
         row_number() over (partition by product_id order by position, id) as rn
  from public.product_images
)
update public.product_images pi
set is_primary = true
from ranked r
where r.id = pi.id and r.rn = 1;

-- Exactly one primary image per product
create unique index if not exists one_primary_image_per_product
  on public.product_images (product_id)
  where is_primary;

-- 2. position: enforce NOT NULL and uniqueness within a product
alter table public.product_images
  alter column position set not null,
  alter column position set default 1;

create unique index if not exists product_images_product_position_key
  on public.product_images (product_id, "position");

-- Plain product_id index is now redundant (covered by the composite unique index)
drop index if exists public.idx_product_images_product;

-- 3. Sync trigger: products.main_image_url always mirrors the primary image
create or replace function public.sync_product_main_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_product bigint;
begin
  affected_product := coalesce(new.product_id, old.product_id);

  update public.products p
  set main_image_url = (
    select image_url
    from public.product_images
    where product_id = affected_product
      and is_primary
    limit 1
  )
  where p.id = affected_product;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_main_image on public.product_images;
create trigger trg_sync_main_image
after insert or delete or update of image_url, is_primary
on public.product_images
for each row
execute function public.sync_product_main_image();

comment on column public.product_images.is_primary is
  'Exactly one primary image per product (enforced by partial unique index). Drives products.main_image_url via trigger.';;
