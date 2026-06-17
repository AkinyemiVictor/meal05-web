import { createServerClient } from "@supabase/ssr";
import { supabasePublicConfig } from "@/lib/config/supabase";

export const getSupabaseRouteClient = (cookieStore) => {
  const resolveCookieStore = async () => {
    try {
      return await cookieStore;
    } catch {
      return null;
    }
  };

  return createServerClient(supabasePublicConfig.url, supabasePublicConfig.anonKey, {
    cookies: {
      getAll: async () => {
        try {
          const store = await resolveCookieStore();
          if (!store?.getAll) return null;
          return store.getAll();
        } catch {
          return null;
        }
      },
      setAll: async (cookiesToSet) => {
        try {
          const store = await resolveCookieStore();
          if (!store?.set || !Array.isArray(cookiesToSet)) return;
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              store.set(name, value, options);
            } catch {
              /* noop */
            }
          });
        } catch {
          /* noop */
        }
      },
    },
  });
};

export default getSupabaseRouteClient;
