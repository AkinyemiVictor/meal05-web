import { cache } from "react";
import { unstable_cache } from "next/cache";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const DEFAULT_MARKET_SELECT = [
  "id",
  "code",
  "country",
  "currency_code",
  "currency_symbol",
  "locale",
  "timezone",
  "status",
  "is_default",
].join(", ");

const requiredText = (value, field) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Default market is missing required field "${field}".`);
  }
  return normalized;
};

export const normalizeMarket = (row) => {
  if (!row || typeof row !== "object") {
    throw new Error("Default market record is missing.");
  }

  return Object.freeze({
    id: requiredText(row.id, "id"),
    code: requiredText(row.code, "code").toUpperCase(),
    country: requiredText(row.country, "country"),
    currencyCode: requiredText(row.currency_code, "currency_code").toUpperCase(),
    currencySymbol: String(row.currency_symbol ?? "").trim(),
    locale: requiredText(row.locale, "locale"),
    timezone: requiredText(row.timezone, "timezone"),
  });
};

const loadDefaultMarket = async () => {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("markets")
    .select(DEFAULT_MARKET_SELECT)
    .eq("is_default", true)
    .eq("status", "active")
    .limit(2);

  if (error) {
    throw new Error(`Unable to load the default market: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one active default market, found ${rows.length}.`);
  }

  return normalizeMarket(rows[0]);
};

// The active market changes very rarely compared with price and stock. Keep it
// in Next's server cache while React cache also deduplicates calls made by one
// render. Product catalogue rows and all cart/order validation remain live.
const loadCachedDefaultMarket = unstable_cache(loadDefaultMarket, ["default-market"], {
  revalidate: 3600,
  tags: ["default-market"],
});

export const getDefaultMarket = cache(loadCachedDefaultMarket);
