import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "@/lib/config/supabase";

let browserClient = null;

export const getBrowserSupabaseClient = () => {
  if (typeof window === "undefined") {
    throw new Error("getBrowserSupabaseClient can only be used in the browser.");
  }

  if (browserClient) {
    return browserClient;
  }

  // Use SSR-aware browser client so auth cookies stay in sync for server routes/layouts.
  browserClient = createBrowserClient(supabasePublicConfig.url, supabasePublicConfig.anonKey);

  return browserClient;
};
