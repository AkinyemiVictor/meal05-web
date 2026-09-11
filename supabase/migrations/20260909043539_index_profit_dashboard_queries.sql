create index if not exists order_items_supplier_id_idx
  on public.order_items(supplier_id);

create index if not exists orders_paid_at_paid_idx
  on public.orders(paid_at desc)
  where payment_status = 'paid';

comment on index public.order_items_supplier_id_idx is
  'Supports supplier foreign-key maintenance and purchase-cost audit lookups.';
comment on index public.orders_paid_at_paid_idx is
  'Supports paid revenue and gross-profit dashboard windows without scanning unpaid orders.';
