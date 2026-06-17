import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import {
  DEFAULT_DELIVERY_SETTINGS,
  DELIVERY_SETTINGS_KEY,
  normalizeDeliverySettingsRecord,
} from "@/lib/delivery-settings";

const isUnknownColumnError = (message) => {
  const text = String(message || "");
  return (
    /schema cache/i.test(text) ||
    /column .* does not exist/i.test(text) ||
    /could not find the .* column/i.test(text) ||
    /relation .* does not exist/i.test(text)
  );
};

export async function loadDeliverySettings() {
  const { settings } = await loadDeliverySettingsAdminData();
  return settings;
}

export async function loadDeliverySettingsAdminData() {
  const admin = getSupabaseAdminClient();
  const warnings = [];

  let result;
  try {
    result = await admin.from("delivery_settings").select("*").eq("key", DELIVERY_SETTINGS_KEY).maybeSingle();
  } catch (error) {
    warnings.push(error?.message || "Delivery settings lookup failed.");
    return {
      settings: { ...DEFAULT_DELIVERY_SETTINGS },
      schemaAvailable: false,
      warnings,
    };
  }

  if (result.error) {
    if (isUnknownColumnError(result.error.message)) {
      warnings.push("Delivery settings are unavailable until the delivery settings migration is applied.");
    } else {
      warnings.push(`Delivery settings lookup failed: ${result.error.message}`);
    }
    return {
      settings: { ...DEFAULT_DELIVERY_SETTINGS },
      schemaAvailable: false,
      warnings,
    };
  }

  if (!result.data) {
    return {
      settings: { ...DEFAULT_DELIVERY_SETTINGS },
      schemaAvailable: true,
      warnings,
    };
  }

  return {
    settings: normalizeDeliverySettingsRecord(result.data),
    schemaAvailable: true,
    warnings,
  };
}
