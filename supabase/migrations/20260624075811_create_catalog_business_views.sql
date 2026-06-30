-- A one-glance catalog summary: each product with its category, price range, and total stock.
CREATE OR REPLACE VIEW public.v_catalog_overview
WITH (security_invoker = on) AS
SELECT
  p.id                                                        AS product_id,
  p.name                                                      AS product,
  c.name                                                      AS category,
  p.is_active,
  p.in_season,
  count(v.id)                                                 AS variant_count,
  count(v.id) FILTER (WHERE v.is_active)                      AS active_variants,
  min(v.price) FILTER (WHERE v.is_active)                     AS from_price,
  max(v.price) FILTER (WHERE v.is_active)                     AS to_price,
  COALESCE(sum(v.stock_count) FILTER (WHERE v.is_active), 0)  AS total_stock,
  p.created_at
FROM public.products p
LEFT JOIN public.product_categories c ON c.id = p.category_id
LEFT JOIN public.product_variants  v ON v.product_id = p.id
GROUP BY p.id, p.name, c.name, p.is_active, p.in_season, p.created_at
ORDER BY c.name NULLS LAST, p.name;

COMMENT ON VIEW public.v_catalog_overview IS 'Business view: one row per product with category, active-variant count, price range, and total stock. Read-only summary for staff.';

-- A restock worklist: active variants running low (default threshold 5 units).
CREATE OR REPLACE VIEW public.v_low_stock
WITH (security_invoker = on) AS
SELECT
  v.id           AS variant_id,
  p.name         AS product,
  v.name         AS variant,
  v.unit,
  v.stock_count,
  v.price,
  c.name         AS category
FROM public.product_variants v
JOIN public.products p ON p.id = v.product_id
LEFT JOIN public.product_categories c ON c.id = p.category_id
WHERE v.is_active
  AND v.stock_count <= 5
ORDER BY v.stock_count ASC, p.name;

COMMENT ON VIEW public.v_low_stock IS 'Business view: active variants at or below 5 units in stock — a restock worklist. Threshold can be adjusted.';
