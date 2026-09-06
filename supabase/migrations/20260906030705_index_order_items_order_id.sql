create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

comment on index public.order_items_order_id_idx is
  'Speeds admin and customer order-detail lookups by order ID.';
