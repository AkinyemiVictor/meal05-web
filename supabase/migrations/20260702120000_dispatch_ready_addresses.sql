-- Human-readable rider instructions remain separate from machine location data.
alter table public.orders
  add column if not exists delivery_house_number text,
  add column if not exists delivery_street text,
  add column if not exists delivery_landmark text,
  add column if not exists delivery_address_label text,
  add column if not exists delivery_contact_name text,
  add column if not exists delivery_contact_phone text;

alter table public.user_addresses
  add column if not exists house_number text,
  add column if not exists landmark text;

comment on column public.orders.delivery_house_number is 'House, flat, shop or gate number supplied for dispatch.';
comment on column public.orders.delivery_street is 'Street, estate or locality supplied for dispatch.';
comment on column public.orders.delivery_landmark is 'Rider-facing landmark or final approach directions.';
comment on column public.orders.delivery_address_label is 'Customer label such as Home or Office.';
comment on column public.orders.delivery_contact_phone is 'Phone number supplied to the assigned delivery partner for this order.';
notify pgrst, 'reload schema';
