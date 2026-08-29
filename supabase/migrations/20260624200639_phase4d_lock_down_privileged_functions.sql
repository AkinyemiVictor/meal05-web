
-- Privileged admin RPCs: callable only server-side via service_role
REVOKE EXECUTE ON FUNCTION public.reset_user_password(uuid, text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.reset_user_password(uuid, text) TO service_role;
ALTER  FUNCTION public.reset_user_password(uuid, text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.assign_role(uuid, text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.assign_role(uuid, text) TO service_role;
ALTER  FUNCTION public.assign_role(uuid, text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.deactivate_user(uuid) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.deactivate_user(uuid) TO service_role;
ALTER  FUNCTION public.deactivate_user(uuid) SET search_path = public;

-- Trigger functions should never be callable through the REST API
REVOKE EXECUTE ON FUNCTION public.handle_new_user()     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_updated_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_deleted_user() FROM anon, authenticated, public;
ALTER  FUNCTION public.handle_new_user()     SET search_path = public;
ALTER  FUNCTION public.handle_updated_user() SET search_path = public;
ALTER  FUNCTION public.handle_deleted_user() SET search_path = public;

-- Maintenance routine: server-side only
REVOKE EXECUTE ON FUNCTION public.refresh_daily_category_performance() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.refresh_daily_category_performance() TO service_role;
ALTER  FUNCTION public.refresh_daily_category_performance() SET search_path = public;
;
