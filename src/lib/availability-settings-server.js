import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { normalizeAvailabilitySettingsRecord } from "@/lib/availability-settings";

export class AvailabilitySettingsError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AvailabilitySettingsError";
    this.cause = cause;
  }
}

export async function loadAvailabilitySettings({ admin, marketId } = {}) {
  const client = admin || getSupabaseAdminClient();
  const resolvedMarketId = String(marketId || "").trim();

  if (!resolvedMarketId) {
    throw new AvailabilitySettingsError("Availability settings require a market.");
  }

  const { data, error } = await client
    .from("availability_settings")
    .select("market_id, timezone, business_opens, business_closes, confirmation_sla_minutes, payment_window_minutes")
    .eq("market_id", resolvedMarketId)
    .maybeSingle();

  if (error) {
    throw new AvailabilitySettingsError("Unable to load availability settings.", error);
  }
  if (!data) {
    throw new AvailabilitySettingsError("Availability settings are not configured for this market.");
  }

  return normalizeAvailabilitySettingsRecord(data);
}
