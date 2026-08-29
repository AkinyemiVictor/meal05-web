
-- snapshot order children before clearing
CREATE TABLE backup.payments_20260624   AS SELECT * FROM public.payments;
CREATE TABLE backup.deliveries_20260624  AS SELECT * FROM public.deliveries;
CREATE TABLE backup.order_items_20260624 AS SELECT * FROM public.order_items;

-- drop the 3 views that block dropping users_old (rebuilt below)
DROP VIEW IF EXISTS public.vw_delivery_queue;
DROP VIEW IF EXISTS public.vw_delivery_summary;
DROP VIEW IF EXISTS public.vw_top_customers;

-- clear the 3 pre-launch test orders and their children
DELETE FROM public.voucher_uses;
DELETE FROM public.payments;
DELETE FROM public.deliveries;
DELETE FROM public.order_items;
DELETE FROM public.orders;

-- drop empty roles table; users.role is the single source of truth
DROP TABLE public.roles;

-- repoint user foreign keys off legacy users_old onto auth.users
ALTER TABLE public.orders     DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE public.orders     ADD  CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_fkey;
ALTER TABLE public.cart_items ADD  CONSTRAINT cart_items_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- retire the legacy table (removes the exposed password_hash too)
DROP TABLE public.users_old;

-- rebuild the reporting views against the live users table (guest-friendly LEFT JOINs)
CREATE VIEW public.vw_delivery_queue WITH (security_invoker = on) AS
SELECT o.order_reference, u.name AS customer, u.phone,
       COALESCE(o.delivery_address, u.address) AS address,
       o.total, o.payment_verified, o.delivery_status, o.created_at
FROM public.orders o
LEFT JOIN public.users u ON u.id = o.user_id
WHERE o.delivery_status <> 'delivered'
ORDER BY o.created_at;

CREATE VIEW public.vw_delivery_summary WITH (security_invoker = on) AS
SELECT d.id AS delivery_id, o.id AS order_id, o.order_reference, o.status AS order_status,
       u.name AS customer_name, u.phone AS customer_phone,
       COALESCE(o.delivery_address, u.address) AS delivery_address,
       p.status AS payment_status, p.method AS payment_method,
       a.full_name AS driver_name, a.phone AS driver_phone,
       d.status AS delivery_status, d.created_at AS created_on,
       d.updated_at AS last_update, d.delivered_at, o.total
FROM public.deliveries d
JOIN public.orders o ON d.order_id = o.id
LEFT JOIN public.users u ON o.user_id = u.id
LEFT JOIN public.payments p ON p.order_id = o.id
LEFT JOIN public.delivery_agents a ON a.id = d.agent_id
ORDER BY d.created_at DESC;

CREATE VIEW public.vw_top_customers WITH (security_invoker = on) AS
SELECT u.id AS customer_id, u.name AS customer_name, u.email, u.phone,
       count(o.id) AS total_orders, sum(o.total) AS total_spent,
       avg(o.total) AS avg_order_value, max(o.created_at) AS last_order_date
FROM public.users u
JOIN public.orders o ON o.user_id = u.id
WHERE o.status = ANY (ARRAY['paid','completed'])
GROUP BY u.id, u.name, u.email, u.phone
ORDER BY sum(o.total) DESC, count(o.id) DESC;
;
