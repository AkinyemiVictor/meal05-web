alter table public.products
  add column if not exists handling_protocols text[] not null default '{}'::text[],
  add column if not exists storage_tips text[] not null default '{}'::text[];

comment on column public.products.description is
  'Customer-facing About this item copy for the product detail page.';

comment on column public.products.handling_protocols is
  'Customer-facing handling and preparation protocol tips shown on the product detail page.';

comment on column public.products.storage_tips is
  'Customer-facing storage tips shown on the product detail page.';;
