import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { normalizeAvailabilitySettingsRecord, parseBusinessTime } from "@/lib/availability-settings";

export class AvailabilitySettingsError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AvailabilitySettingsError";
    this.cause = cause;
  }
}

const assertUsableSettings = (settings) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }).format(new Date());
  } catch (error) {
    throw new AvailabilitySettingsError("Availability settings contain an invalid timezone.", error);
  }

  const opens = parseBusinessTime(settings.businessOpens);
  const closes = parseBusinessTime(settings.businessCloses);
  const opensAt = opens.hour * 60 + opens.minute;
  const closesAt = closes.hour * 60 + closes.minute;
  if (closesAt <= opensAt) {
    throw new AvailabilitySettingsError("Availability business closing time must be later than opening time.");
  }
};

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

  const settings = normalizeAvailabilitySettingsRecord(data);
  assertUsableSettings(settings);
  return settings;
}
