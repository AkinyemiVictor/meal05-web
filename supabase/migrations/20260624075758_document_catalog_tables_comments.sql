
-- Table-level descriptions (visible in the Supabase dashboard)
COMMENT ON TABLE public.products IS 'Master product catalog. One row per sellable produce item; pricing and stock live on product_variants.';
COMMENT ON TABLE public.product_variants IS 'Sellable variants of a product (e.g. different units, sizes, grades). Holds price and stock_count.';
COMMENT ON TABLE public.product_categories IS 'Product groupings shown in storefront navigation (e.g. Vegetables, Peppers, Tubers).';
COMMENT ON TABLE public.product_images IS 'Image gallery for products and optionally specific variants. position controls display order.';

-- products columns
COMMENT ON COLUMN public.products.sku IS 'Unique stock-keeping code for the product.';
COMMENT ON COLUMN public.products.category_id IS 'References product_categories.id.';
COMMENT ON COLUMN public.products.main_image_url IS 'Primary storefront image for the product card.';
COMMENT ON COLUMN public.products.is_active IS 'When false, the product is hidden from the storefront.';
COMMENT ON COLUMN public.products.in_season IS 'Seasonal availability flag for farm-fresh produce.';

-- product_variants columns (the flexible Nigerian-produce schema)
COMMENT ON COLUMN public.product_variants.unit IS 'Customer-facing sales unit label, e.g. kg, paint, derica, mudu, piece.';
COMMENT ON COLUMN public.product_variants.price IS 'Selling price for this variant (NGN).';
COMMENT ON COLUMN public.product_variants.old_price IS 'Optional original/strike-through price for showing a discount.';
COMMENT ON COLUMN public.product_variants.stock_count IS 'Units currently in stock for this variant.';
COMMENT ON COLUMN public.product_variants.base_unit IS 'Canonical unit (e.g. kg, g, L) used to normalize and compare variants.';
COMMENT ON COLUMN public.product_variants.base_quantity IS 'Quantity in base_unit that this variant represents, for price-per-unit math.';
COMMENT ON COLUMN public.product_variants.grade IS 'Quality grade: A, B, or C.';
COMMENT ON COLUMN public.product_variants.form IS 'Physical form: fresh, processed, dried, smoked, powdered, liquid, whole, or cut.';
COMMENT ON COLUMN public.product_variants.ripeness IS 'Ripeness state where relevant (e.g. ripe, unripe).';
COMMENT ON COLUMN public.product_variants.is_default IS 'The variant pre-selected on the product page.';
COMMENT ON COLUMN public.product_variants.is_active IS 'When false, the variant is not sellable.';

-- product_categories columns
COMMENT ON COLUMN public.product_categories.slug IS 'URL-friendly identifier for the category.';
;
