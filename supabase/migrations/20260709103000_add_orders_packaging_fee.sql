ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS packaging_fee integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.orders.packaging_fee IS 'Visible packaging fee charged on the order, separate from subtotal and delivery fee.';
