import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig, getSupabaseServerConfig } from "@/lib/config/supabase";

let cachedAdminClient = null;

export const getSupabaseAdminClient = () => {
  const { serviceRoleKey } = getSupabaseServerConfig();

  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(supabasePublicConfig.url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  return cachedAdminClient;
};

