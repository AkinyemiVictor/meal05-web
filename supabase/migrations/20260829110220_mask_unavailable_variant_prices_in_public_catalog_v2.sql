CREATE OR REPLACE VIEW public.product_card_catalog AS
SELECT
    p.id AS product_id,
    COALESCE(NULLIF(btrim(pm.local_name), ''::text), NULLIF(btrim(p.local_name), ''::text), p.name) AS name,
    p.description,
    p.sku,
    p.category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    COALESCE(NULLIF(btrim(primary_image.card_url), ''::text), NULLIF(btrim(p.main_image_url), ''::text), primary_image.image_url) AS main_image_url,
    p.is_active,
    COALESCE(p.in_season, true) AS in_season,
    p.search_keywords,
    p.sourcing_type,
    p.promo_tag_enabled,
    p.promo_tag_text,
    p.promo_tag_expires_at,
    (p.promo_tag_enabled AND (NULLIF(btrim(COALESCE(p.promo_tag_text, ''::text)), ''::text) IS NOT NULL) AND ((p.promo_tag_expires_at IS NULL) OR (p.promo_tag_expires_at > now()))) AS promo_tag_visible,
    chosen_variant.variant_id AS default_variant_id,
    chosen_variant.variant_name AS default_variant_name,
    chosen_variant.unit,
    chosen_variant.base_unit,
    chosen_variant.base_quantity,
    chosen_variant.purchase_mode,
    chosen_variant.min_quantity,
    chosen_variant.max_quantity,
    chosen_variant.step_quantity,
    CASE WHEN chosen_variant.availability_mode = 'unavailable' THEN 0::numeric(12,2) ELSE chosen_variant.price END AS starting_price,
    CASE WHEN chosen_variant.availability_mode = 'unavailable' THEN NULL::numeric(12,2) ELSE chosen_variant.old_price END AS old_price,
    chosen_variant.stock_count,
    ((chosen_variant.availability_mode <> 'unavailable') AND (COALESCE(chosen_variant.stock_count, (0)::numeric) > (0)::numeric)) AS in_stock,
    pm.market_id,
    m.code AS market_code,
    m.country AS market_country,
    COALESCE(chosen_variant.currency_code, m.currency_code) AS currency_code,
    m.currency_symbol,
    m.locale,
    m.timezone,
    p.created_at,
    p.updated_at,
    concat_ws(' '::text, p.name, p.local_name, pm.local_name, p.search_keywords, c.name, c.slug, chosen_variant.variant_name, chosen_variant.unit) AS search_text,
    primary_image.thumb_url AS thumb_image_url,
    primary_image.card_url AS card_image_url,
    primary_image.detail_url AS detail_image_url,
    primary_image.original_url AS original_image_url,
    chosen_variant.active_variant_count,
    p.display_group,
    p.display_group_order,
    CASE
        WHEN (NULLIF(btrim(p.display_group), ''::text) IS NULL) THEN (p.id * 100)
        ELSE ((min(p.id) OVER (PARTITION BY pm.market_id, p.display_group) * 100) + COALESCE(p.display_group_order, 99))
    END AS display_sort_order
FROM product_markets pm
JOIN markets m ON m.id = pm.market_id
JOIN products p ON p.id = pm.product_id
LEFT JOIN product_categories c ON c.id = p.category_id
LEFT JOIN LATERAL (
    SELECT pi.image_url, pi.thumb_url, pi.card_url, pi.detail_url, pi.original_url
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_primary DESC, pi."position", pi.id
    LIMIT 1
) primary_image ON true
JOIN LATERAL (
    SELECT
        v.id AS variant_id,
        v.name AS variant_name,
        v.unit,
        v.base_unit,
        v.base_quantity,
        v.purchase_mode,
        v.min_quantity,
        v.max_quantity,
        v.step_quantity,
        v.price,
        v.old_price,
        v.stock_count,
        v.currency_code,
        v.availability_mode,
        (count(*) OVER ())::integer AS active_variant_count
    FROM product_variants v
    WHERE v.product_id = p.id
      AND v.market_id = pm.market_id
      AND v.is_active
      AND v.price > 0::numeric
    ORDER BY (v.availability_mode <> 'unavailable') DESC,
             (COALESCE(v.stock_count, 0::numeric) > 0::numeric) DESC,
             v.price,
             v.id
    LIMIT 1
) chosen_variant ON true
WHERE pm.is_listed
  AND m.status = 'active'::text
  AND p.is_active
  AND COALESCE(c.is_active, true);

CREATE OR REPLACE VIEW public.product_card_catalog_with_options AS
SELECT
    catalog.product_id,
    catalog.name,
    catalog.description,
    catalog.sku,
    catalog.category_id,
    catalog.category_name,
    catalog.category_slug,
    catalog.main_image_url,
    catalog.is_active,
    catalog.in_season,
    catalog.search_keywords,
    catalog.sourcing_type,
    catalog.promo_tag_enabled,
    catalog.promo_tag_text,
    catalog.promo_tag_expires_at,
    catalog.promo_tag_visible,
    catalog.default_variant_id,
    catalog.default_variant_name,
    catalog.unit,
    catalog.base_unit,
    catalog.base_quantity,
    catalog.purchase_mode,
    catalog.min_quantity,
    catalog.max_quantity,
    catalog.step_quantity,
    catalog.starting_price,
    catalog.old_price,
    catalog.stock_count,
    catalog.in_stock,
    catalog.market_id,
    catalog.market_code,
    catalog.market_country,
    catalog.currency_code,
    catalog.currency_symbol,
    catalog.locale,
    catalog.timezone,
    catalog.created_at,
    catalog.updated_at,
    catalog.search_text,
    catalog.thumb_image_url,
    catalog.card_image_url,
    catalog.detail_image_url,
    catalog.original_image_url,
    catalog.active_variant_count,
    COALESCE(options.variations, '[]'::jsonb) AS variations,
    catalog.display_group,
    catalog.display_group_order,
    catalog.display_sort_order
FROM product_card_catalog catalog
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', variant.id,
            'product_id', variant.product_id,
            'name', variant.name,
            'unit', variant.unit,
            'price', CASE WHEN variant.availability_mode = 'unavailable' THEN 0::numeric(12,2) ELSE variant.price END,
            'old_price', CASE WHEN variant.availability_mode = 'unavailable' THEN NULL::numeric(12,2) ELSE variant.old_price END,
            'stock_count', variant.stock_count,
            'size', variant.size,
            'size_label', variant.size_label,
            'display_label', variant.display_label,
            'ripeness', variant.ripeness,
            'base_unit', variant.base_unit,
            'base_quantity', variant.base_quantity,
            'is_default', variant.is_default,
            'is_active', variant.is_active,
            'weight_min', variant.weight_min,
            'weight_max', variant.weight_max,
            'weight_unit', variant.weight_unit,
            'volume_min', variant.volume_min,
            'volume_max', variant.volume_max,
            'volume_unit', variant.volume_unit,
            'market_id', variant.market_id,
            'currency_code', variant.currency_code,
            'purchase_mode', variant.purchase_mode,
            'min_quantity', variant.min_quantity,
            'max_quantity', variant.max_quantity,
            'step_quantity', variant.step_quantity,
            'option_role', variant.option_role,
            'availability_mode', variant.availability_mode,
            'inventory_tracking_mode', variant.inventory_tracking_mode
        ) ORDER BY variant.id
    ) AS variations
    FROM product_variants variant
    WHERE variant.product_id = catalog.product_id
      AND variant.market_id = catalog.market_id
      AND variant.is_active
      AND variant.price > 0::numeric
) options ON true;;
