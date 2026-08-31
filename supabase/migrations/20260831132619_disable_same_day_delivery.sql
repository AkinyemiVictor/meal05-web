alter table public.delivery_settings
  alter column same_day_enabled set default false;

alter table public.orders
  add column if not exists delivery_slot text not null default 'delivery-24-hours';

alter table public.orders
  drop constraint if exists orders_delivery_slot_check;

alter table public.orders
  add constraint orders_delivery_slot_check
  check (delivery_slot in ('delivery-24-hours', 'delivery-48-hours'));

update public.delivery_settings
set
  same_day_enabled = false,
  same_day_notice = 'Choose 24-hour or 48-hour delivery at checkout. Delivery runs from 4:00 PM to 6:00 PM on the scheduled day.',
  updated_at = timezone('utc', now());
