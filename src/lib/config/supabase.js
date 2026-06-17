const isBrowser = typeof window !== "undefined";

const ensureEnv = (key) => {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Required environment variable "${key}" is missing.`);
  }
  return value;
};

// For client-side (browser) bundles, Next.js only inlines env vars
// when they are referenced statically, e.g. process.env.NEXT_PUBLIC_*
// Do NOT access them via dynamic keys or helper functions.
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabasePublicConfig = Object.freeze({
  url: publicUrl,
  anonKey: publicAnonKey,
});

// Provide a clear runtime error in the browser if envs are missing
if (typeof window !== "undefined") {
  if (!publicUrl || !publicAnonKey) {
    throw new Error(
      "Required environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Add them to .env.local and restart the dev server."
    );
  }
}

let cachedServerConfig = null;

export const getSupabaseServerConfig = () => {
  if (isBrowser) {
    throw new Error("getSupabaseServerConfig can only be used on the server.");
  }

  if (cachedServerConfig) {
    return cachedServerConfig;
  }

  cachedServerConfig = Object.freeze({
    serviceRoleKey: ensureEnv("SUPABASE_SERVICE_ROLE_KEY"),
    db: Object.freeze({
      poolerUrl: ensureEnv("SUPABASE_DB_POOLER_URL"),
      directUrl: ensureEnv("SUPABASE_DB_DIRECT_URL"),
    }),
  });

  return cachedServerConfig;
};
