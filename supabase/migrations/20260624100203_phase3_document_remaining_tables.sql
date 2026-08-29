
-- table descriptions
COMMENT ON TABLE public.users IS 'Customer and staff accounts, linked 1:1 to auth.users. The role column drives access.';
COMMENT ON TABLE public.user_addresses IS 'Saved delivery addresses in a customer address book.';
COMMENT ON TABLE public.orders IS 'Customer orders with totals, payment, delivery, and fulfilment details.';
COMMENT ON TABLE public.order_items IS 'Line items belonging to an order (product variant, quantity, price).';
COMMENT ON TABLE public.cart_items IS 'Items currently in a shopping cart for a user.';
COMMENT ON TABLE public.payments IS 'Payment records against orders (amount, method, status, reference).';
COMMENT ON TABLE public.payment_methods IS 'Saved customer payment methods and tokens.';
COMMENT ON TABLE public.deliveries IS 'Delivery records for orders: dispatch, driver, and delivery status.';
COMMENT ON TABLE public.delivery_agents IS 'Dispatch riders/drivers who fulfil deliveries.';
COMMENT ON TABLE public.wishlists IS 'Products a user has saved to a wishlist.';
COMMENT ON TABLE public.product_ratings IS 'Customer star ratings (1 to 5) for products.';
COMMENT ON TABLE public.attributes IS 'Configurable product attributes (e.g. Size, Colour, Packaging).';
COMMENT ON TABLE public.attribute_options IS 'Allowed values for each product attribute (e.g. Size: Small, Large).';
COMMENT ON TABLE public.attribute_price_modifiers IS 'Price adjustments tied to an attribute option (multiplier or additive).';
COMMENT ON TABLE public.product_attributes IS 'Join table linking products to their attributes.';
COMMENT ON TABLE public.admin_logs IS 'Audit log of admin actions and system events or errors.';
COMMENT ON TABLE public.order_status_transitions IS 'Allowed order status transitions (state-machine config).';
COMMENT ON TABLE public.system_settings IS 'Generic key/value store for app-wide settings.';
COMMENT ON TABLE public.auth_admin_queue IS 'Queue of admin auth actions to process, e.g. password resets.';
COMMENT ON TABLE public.rls_debug_log IS 'Diagnostic log for Row Level Security checks. Housekeeping/dev only.';
COMMENT ON TABLE public.schema_backups IS 'Record of schema export/backup events. Housekeeping.';

-- key business columns
COMMENT ON COLUMN public.users.role IS 'Access role: customer, admin, warehouse, or driver. Single source of truth.';
COMMENT ON COLUMN public.users.is_active IS 'When false, the account is disabled.';
COMMENT ON COLUMN public.users.deleted_at IS 'Soft-delete timestamp; non-null means hidden.';
COMMENT ON COLUMN public.orders.status IS 'Order lifecycle status, e.g. pending, paid, completed.';
COMMENT ON COLUMN public.orders.payment_status IS 'Payment state, e.g. unpaid, paid.';
COMMENT ON COLUMN public.orders.payment_method IS 'How the order was paid, e.g. paystack, opay, transfer, cash.';
COMMENT ON COLUMN public.orders.payment_verified IS 'True once payment has been confirmed.';
COMMENT ON COLUMN public.orders.delivery_status IS 'Fulfilment state, e.g. awaiting dispatch, dispatched, delivered.';
COMMENT ON COLUMN public.orders.order_reference IS 'Public human-readable order reference.';
COMMENT ON COLUMN public.orders.total IS 'Final order total after delivery fee and discounts.';
COMMENT ON COLUMN public.deliveries.status IS 'Delivery state: awaiting dispatch, dispatched, delivered.';
COMMENT ON COLUMN public.deliveries.agent_id IS 'Assigned delivery agent (rider).';
COMMENT ON COLUMN public.payments.method IS 'Payment channel, e.g. cash, transfer, paystack, opay.';
COMMENT ON COLUMN public.payments.status IS 'Payment status, e.g. pending, success, failed.';
COMMENT ON COLUMN public.payments.transaction_ref IS 'Unique gateway/transaction reference.';
COMMENT ON COLUMN public.delivery_agents.zone IS 'Primary delivery zone the agent covers.';
COMMENT ON COLUMN public.product_ratings.rating IS 'Star rating from 1 to 5.';
COMMENT ON COLUMN public.product_attributes.product_id IS 'References products.id.';
COMMENT ON COLUMN public.attribute_options.attribute_id IS 'References attributes.id.';
;
