-- reliable admin check from users.role; SECURITY DEFINER avoids RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.auth_id = (SELECT auth.uid()) OR u.id = (SELECT auth.uid()))
      AND u.role IN ('admin','superadmin')
      AND COALESCE(u.is_active, true)
  );
$$;
COMMENT ON FUNCTION public.is_admin_user() IS 'True if the current user is an active admin (reads users.role). SECURITY DEFINER to avoid RLS recursion. Used in RLS policies.';

-- ===== standard public-read tables: anyone reads, only admins write =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','product_variants','product_images','attributes','attribute_options',
    'attribute_price_modifiers','product_attributes','delivery_zones','delivery_settings',
    'pickup_locations','daily_menus','daily_menu_items','order_status_transitions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true);', t||'_public_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_admin_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());', t||'_admin_all', t);
  END LOOP;
END $$;

-- ===== promo_codes: read only active codes (or admin), admin writes =====
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_codes_public_read ON public.promo_codes;
CREATE POLICY promo_codes_public_read ON public.promo_codes FOR SELECT TO public USING (is_active = true OR public.is_admin_user());
DROP POLICY IF EXISTS promo_codes_admin_all ON public.promo_codes;
CREATE POLICY promo_codes_admin_all ON public.promo_codes FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- ===== product_ratings: everyone reads, customers manage their own, admin all =====
ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_ratings_public_read ON public.product_ratings;
CREATE POLICY product_ratings_public_read ON public.product_ratings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS product_ratings_owner_insert ON public.product_ratings;
CREATE POLICY product_ratings_owner_insert ON public.product_ratings FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS product_ratings_owner_update ON public.product_ratings;
CREATE POLICY product_ratings_owner_update ON public.product_ratings FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_admin_user()) WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_admin_user());
DROP POLICY IF EXISTS product_ratings_owner_delete ON public.product_ratings;
CREATE POLICY product_ratings_owner_delete ON public.product_ratings FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_admin_user());
