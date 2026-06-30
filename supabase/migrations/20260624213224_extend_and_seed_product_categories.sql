-- category management columns
ALTER TABLE public.product_categories
  ADD COLUMN is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN sort_order integer;
COMMENT ON COLUMN public.product_categories.is_active IS 'False = category exists but is not yet offered to customers (hidden from storefront).';
COMMENT ON COLUMN public.product_categories.sort_order IS 'Display order in storefront navigation.';

-- admin can now manage categories (was public-read only)
DROP POLICY IF EXISTS product_categories_admin_all ON public.product_categories;
CREATE POLICY product_categories_admin_all ON public.product_categories
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- order the existing categories to match the canonical list
UPDATE public.product_categories SET sort_order = CASE name
  WHEN 'Meat & Poultry'           THEN 1
  WHEN 'Fish & Seafood'           THEN 2
  WHEN 'Vegetables'               THEN 3
  WHEN 'Fruits'                   THEN 4
  WHEN 'Grains & Cereals'         THEN 5
  WHEN 'Dairy & Eggs'             THEN 6
  WHEN 'Tubers & Legumes'         THEN 7
  WHEN 'Spices & Condiments'      THEN 8
  WHEN 'Oil & Cooking Essentials' THEN 9
  WHEN 'Drinks & Beverages'       THEN 10
  ELSE sort_order END;

-- add the categories you'll offer later (hidden for now)
INSERT INTO public.product_categories (name, slug, is_active, sort_order) VALUES
  ('Cooked Food',       'cooked-food',      false, 11),
  ('Snacks & Pastries', 'snacks-pastries',  false, 12);
