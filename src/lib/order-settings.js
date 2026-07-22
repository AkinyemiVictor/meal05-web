export const DEFAULT_ORDER_SETTINGS = {
  standardCheckout: {
    maxWeightKg: 50,
    maxLiquidLiters: 25,
  },
  bulkOrder: {
    enabled: true,
    preserveCart: true,
    heading: "Planning a larger order?",
    message:
      "Meal05 handles larger orders too. Send your basket to our fulfilment team and we will confirm supplier availability, pricing and a suitable delivery plan without affecting normal daily orders.",
    channels: ["whatsapp", "call", "email", "sms", "social"],
  },
  contacts: {
    whatsapp: "",
    call: "",
    email: "",
    sms: "",
    instagram: "",
    facebook: "",
  },
};

const boolFromSetting = (value, fallback) => {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const numberFromSetting = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const channelsFromSetting = (value, fallback) => {
  const channels = String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return channels.length ? Array.from(new Set(channels)) : fallback;
};

const normalizePhone = (value) => String(value || "").replace(/[^\d+]/g, "");

const normalizeUrl = (value) => {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
};

export async function loadPublicOrderSettings(admin) {
  let rows = [];
  try {
    const { data, error } = await admin
      .from("system_settings")
      .select("key,value")
      .in("key", [
        "standard_checkout_max_weight_kg",
        "standard_checkout_max_liquid_liters",
        "bulk_order_enabled",
        "bulk_order_preserve_cart",
        "bulk_order_channels",
        "bulk_order_heading",
        "bulk_order_message",
      ]);
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch {
    rows = [];
  }

  const map = new Map(rows.map((row) => [String(row.key), row.value]));
  const fallback = DEFAULT_ORDER_SETTINGS;
  return {
    standardCheckout: {
      maxWeightKg: numberFromSetting(map.get("standard_checkout_max_weight_kg"), fallback.standardCheckout.maxWeightKg),
      maxLiquidLiters: numberFromSetting(
        map.get("standard_checkout_max_liquid_liters"),
        fallback.standardCheckout.maxLiquidLiters
      ),
    },
    bulkOrder: {
      enabled: boolFromSetting(map.get("bulk_order_enabled"), fallback.bulkOrder.enabled),
      preserveCart: boolFromSetting(map.get("bulk_order_preserve_cart"), fallback.bulkOrder.preserveCart),
      heading: String(map.get("bulk_order_heading") || fallback.bulkOrder.heading),
      message: String(map.get("bulk_order_message") || fallback.bulkOrder.message),
      channels: channelsFromSetting(map.get("bulk_order_channels"), fallback.bulkOrder.channels),
    },
    contacts: {
      whatsapp: normalizePhone(process.env.NEXT_PUBLIC_MEAL05_WHATSAPP_NUMBER),
      call: normalizePhone(process.env.NEXT_PUBLIC_MEAL05_CALL_NUMBER),
      email: String(process.env.NEXT_PUBLIC_MEAL05_SUPPORT_EMAIL || "").trim(),
      sms: normalizePhone(process.env.NEXT_PUBLIC_MEAL05_SMS_NUMBER),
      instagram: normalizeUrl(process.env.NEXT_PUBLIC_MEAL05_INSTAGRAM_URL),
      facebook: normalizeUrl(process.env.NEXT_PUBLIC_MEAL05_FACEBOOK_URL),
    },
  };
}
