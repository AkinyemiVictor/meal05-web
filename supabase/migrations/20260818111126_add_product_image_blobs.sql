create table if not exists public.product_image_blobs (
  asset_key text primary key,
  mime_type text not null,
  base64_data text not null default '',
  image_width integer,
  image_height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_image_blobs enable row level security;
comment on table public.product_image_blobs is 'Server-served binary image assets stored as base64. Used for small product images when object storage upload is unavailable.';
comment on column public.product_image_blobs.asset_key is 'Stable URL-safe key used by /api/product-assets/[assetKey].';;
