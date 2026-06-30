CREATE SCHEMA IF NOT EXISTS backup;
COMMENT ON SCHEMA backup IS 'Point-in-time table snapshots taken 2026-06-24 before the cleanup migrations. Safe to drop once all changes are confirmed stable.';

CREATE TABLE backup.users_old_20260624          AS SELECT * FROM public.users_old;
CREATE TABLE backup.roles_20260624              AS SELECT * FROM public.roles;
CREATE TABLE backup.orders_20260624             AS SELECT * FROM public.orders;
CREATE TABLE backup.cart_items_20260624         AS SELECT * FROM public.cart_items;
CREATE TABLE backup.vouchers_20260624           AS SELECT * FROM public.vouchers;
CREATE TABLE backup.voucher_uses_20260624       AS SELECT * FROM public.voucher_uses;
CREATE TABLE backup.stock_movements_20260624    AS SELECT * FROM public.stock_movements;
CREATE TABLE backup.stock_movements_v2_20260624 AS SELECT * FROM public.stock_movements_v2;
CREATE TABLE backup.inventory_movements_20260624 AS SELECT * FROM public.inventory_movements;
CREATE TABLE backup.restock_log_20260624        AS SELECT * FROM public.restock_log;
CREATE TABLE backup.stock_deduction_log_20260624 AS SELECT * FROM public.stock_deduction_log;
CREATE TABLE backup.products_20260624           AS SELECT * FROM public.products;
