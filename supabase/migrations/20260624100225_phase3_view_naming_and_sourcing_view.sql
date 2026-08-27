
-- standardize view names to the existing vw_ convention
ALTER VIEW public.v_catalog_overview RENAME TO vw_catalog_overview;
ALTER VIEW public.v_low_stock        RENAME TO vw_low_stock;
ALTER VIEW public.v_todays_menu      RENAME TO vw_todays_menu;

-- sourcing + margin view: each product with its primary supplier, last cost, and gross margin
CREATE VIEW public.vw_sourcing WITH (security_invoker = on) AS
SELECT
  p.id   AS product_id,
  p.name AS product,
  p.sourcing_type,
  s.name  AS primary_supplier,
  s.phone AS supplier_phone,
  ps.last_cost,
  dv.price AS default_price,
  CASE WHEN ps.last_cost IS NOT NULL AND ps.last_cost > 0 AND dv.price IS NOT NULL
       THEN round((dv.price - ps.last_cost) / dv.price * 100, 1)
  END AS gross_margin_pct
FROM public.products p
LEFT JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.is_primary
LEFT JOIN public.suppliers s ON s.id = ps.supplier_id
LEFT JOIN LATERAL (
  SELECT price FROM public.product_variants v
  WHERE v.product_id = p.id AND v.is_default
  ORDER BY v.id LIMIT 1
) dv ON true;
COMMENT ON VIEW public.vw_sourcing IS 'Each product with its primary supplier, last cost, default price, and gross margin percent. Populates as suppliers are linked.';
;
