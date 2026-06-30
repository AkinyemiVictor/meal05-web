export const DELIVERY_SETTINGS_KEY = "default";
export const DEFAULT_DELIVERY_FEE = 1500;
export const DEFAULT_FREE_DELIVERY_THRESHOLD = 40000;
export const DEFAULT_SAME_DAY_ENABLED = true;
export const DEFAULT_SAME_DAY_CUTOFF_TIME = "16:00";
export const DEFAULT_SERVICE_ZONES = [
  "Ibadan North",
  "Ibadan North-East",
  "Ibadan North-West",
  "Ibadan South-East",
  "Ibadan South-West",
  "Akinyele",
  "Egbeda",
  "Ido",
  "Lagelu",
  "Ona Ara",
  "Oluyole",
];
export const DEFAULT_SAME_DAY_NOTICE = "Orders placed before 4:00 PM within Ibadan qualify for same-day delivery.";
export const DELIVERY_SETTINGS_TIME_ZONE = "Africa/Lagos";

export const DEFAULT_SERVICE_ZONE_FEES = DEFAULT_SERVICE_ZONES.map((name) => ({
  name,
  fee: DEFAULT_DELIVERY_FEE,
  subzones: [],
}));

const roundMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
};

const toStringOrEmpty = (value) => (value == null ? "" : String(value));

const toBoolean = (value, fallback = false) => {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  const text = toStringOrEmpty(value).trim().toLowerCase();
  if (!text) return fallback;
  return ["true", "1", "yes", "y", "on"].includes(text);
};

const uniqueStrings = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toStringOrEmpty(value).trim())
        .filter(Boolean)
    )
  );

const normalizeZoneText = (value) =>
  toStringOrEmpty(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatList = (values) => {
  const list = uniqueStrings(values);
  if (!list.length) return DEFAULT_SERVICE_ZONES[0];
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
};

const normalizeCutoffTime = (value) => {
  const text = toStringOrEmpty(value).trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : DEFAULT_SAME_DAY_CUTOFF_TIME;
};

const normalizeIso = (value) => {
  const text = toStringOrEmpty(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeServiceZones = (value) => {
  if (Array.isArray(value)) {
    const zones = uniqueStrings(
      value.map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          return entry.name || entry.zone || entry.lga || "";
        }
        return "";
      })
    );
    return zones.length ? zones : [...DEFAULT_SERVICE_ZONES];
  }

  const text = toStringOrEmpty(value).trim();
  if (!text) return [...DEFAULT_SERVICE_ZONES];

  const zones = uniqueStrings(text.split(/[\n,]+/));
  return zones.length ? zones : [...DEFAULT_SERVICE_ZONES];
};

const normalizeSubzones = (value, fallbackFee) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        const name = entry.trim();
        if (!name) return null;
        return { name, fee: fallbackFee };
      }
      if (!entry || typeof entry !== "object") return null;
      const name = toStringOrEmpty(entry.name || entry.zone || entry.lga).trim();
      if (!name) return null;
      const fee = roundMoney(entry.fee ?? entry.deliveryFee ?? entry.price, fallbackFee);
      return { name, fee };
    })
    .filter(Boolean);
};

export const normalizeServiceZoneFees = (value, fallbackFee = DEFAULT_DELIVERY_FEE) => {
  const fallback = roundMoney(fallbackFee, DEFAULT_DELIVERY_FEE);
  if (!Array.isArray(value)) {
    return DEFAULT_SERVICE_ZONE_FEES.map((zone) => ({
      ...zone,
      fee: roundMoney(zone.fee, fallback),
    }));
  }

  const zones = value
    .map((entry) => {
      if (typeof entry === "string") {
        const name = entry.trim();
        if (!name) return null;
        return { name, fee: fallback, subzones: [] };
      }
      if (!entry || typeof entry !== "object") return null;
      const name = toStringOrEmpty(entry.name || entry.zone || entry.lga).trim();
      if (!name) return null;
      const fee = roundMoney(entry.fee ?? entry.deliveryFee ?? entry.price, fallback);
      const subzones = normalizeSubzones(entry.subzones || entry.subZones || entry.sub_locations || entry.subLocations, fee);
      return { name, fee, subzones };
    })
    .filter(Boolean);

  if (!zones.length) {
    return DEFAULT_SERVICE_ZONE_FEES.map((zone) => ({
      ...zone,
      fee: roundMoney(zone.fee, fallback),
    }));
  }

  return zones.map((zone) => ({
    ...zone,
    fee: roundMoney(zone.fee, fallback),
    subzones: normalizeSubzones(zone.subzones, zone.fee),
  }));
};

export const DEFAULT_DELIVERY_SETTINGS = {
  key: DELIVERY_SETTINGS_KEY,
  deliveryFee: DEFAULT_DELIVERY_FEE,
  freeDeliveryThreshold: DEFAULT_FREE_DELIVERY_THRESHOLD,
  sameDayEnabled: DEFAULT_SAME_DAY_ENABLED,
  sameDayCutoffTime: DEFAULT_SAME_DAY_CUTOFF_TIME,
  serviceZones: [...DEFAULT_SERVICE_ZONES],
  serviceZoneFees: DEFAULT_SERVICE_ZONE_FEES.map((zone) => ({ ...zone })),
  sameDayNotice: DEFAULT_SAME_DAY_NOTICE,
  updatedAt: null,
};

export const normalizeDeliverySettingsRecord = (row) => {
  const raw = row && typeof row === "object" ? row : {};
  const deliveryFee = roundMoney(raw.delivery_fee ?? raw.deliveryFee, DEFAULT_DELIVERY_FEE);
  const serviceZoneFees = normalizeServiceZoneFees(raw.service_zone_fees ?? raw.serviceZoneFees ?? raw.service_zones ?? raw.serviceZones, deliveryFee);
  const serviceZones = normalizeServiceZones(raw.service_zones ?? raw.serviceZones ?? serviceZoneFees);
  const sameDayCutoffTime = normalizeCutoffTime(raw.same_day_cutoff_time ?? raw.sameDayCutoffTime);
  const sameDayEnabled = toBoolean(raw.same_day_enabled ?? raw.sameDayEnabled, DEFAULT_SAME_DAY_ENABLED);
  const zoneFeeNames = (serviceZoneFees || [])
    .map((zone) => normalizeZoneText(zone?.name))
    .filter(Boolean);
  const legacyLagosOnly =
    (serviceZones.length === 1 && normalizeZoneText(serviceZones[0]) === "lagos") ||
    (zoneFeeNames.length === 1 && zoneFeeNames[0] === "lagos");
  const normalized = {
    key: toStringOrEmpty(raw.key).trim() || DELIVERY_SETTINGS_KEY,
    deliveryFee,
    freeDeliveryThreshold: roundMoney(
      raw.free_delivery_threshold ?? raw.freeDeliveryThreshold,
      DEFAULT_FREE_DELIVERY_THRESHOLD
    ),
    sameDayEnabled,
    sameDayCutoffTime,
    serviceZones: legacyLagosOnly ? [...DEFAULT_SERVICE_ZONES] : serviceZones,
    serviceZoneFees: legacyLagosOnly ? DEFAULT_SERVICE_ZONE_FEES.map((zone) => ({ ...zone })) : serviceZoneFees,
    sameDayNotice: toStringOrEmpty(raw.same_day_notice ?? raw.sameDayNotice).trim() || "",
    updatedAt: normalizeIso(raw.updated_at ?? raw.updatedAt),
  };

  if (legacyLagosOnly && /lagos/i.test(normalized.sameDayNotice)) {
    normalized.sameDayNotice = "";
  }

  if (!normalized.sameDayNotice) {
    normalized.sameDayNotice = sameDayEnabled
      ? `Orders placed before ${formatDeliveryCutoffLabel(sameDayCutoffTime)} within ${formatList(normalized.serviceZones)} qualify for same-day delivery.`
      : "Same-day delivery is currently unavailable.";
  }

  return normalized;
};

const getLagosTimeParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: DELIVERY_SETTINGS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { hour, minute };
};

const getCutoffMinutes = (time) => {
  const normalized = normalizeCutoffTime(time);
  const [hour, minute] = normalized.split(":").map((part) => Number(part));
  return hour * 60 + minute;
};

export const formatDeliveryCutoffLabel = (time) => {
  const normalized = normalizeCutoffTime(time);
  const [hour, minute] = normalized.split(":").map((part) => Number(part));
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
};

export const formatServiceZonesLabel = (settings) => {
  const zones = normalizeServiceZones(settings?.serviceZoneFees ?? settings?.serviceZones);
  return formatList(zones);
};

export const buildCityServiceMessage = (settings) =>
  `Sorry, we currently service ${formatServiceZonesLabel(settings)} only.`;

export const findMatchingServiceZone = (city, settings) => {
  const cityText = normalizeZoneText(city);
  if (!cityText) return null;

  const zones = normalizeServiceZoneFees(
    settings?.serviceZoneFees ?? settings?.service_zones ?? settings?.serviceZones,
    settings?.deliveryFee
  );
  for (const zone of zones) {
    const zoneText = normalizeZoneText(zone.name);
    if (zoneText && (cityText === zoneText || cityText.includes(zoneText) || zoneText.includes(cityText))) {
      return zone.name;
    }
    const subzones = Array.isArray(zone.subzones) ? zone.subzones : [];
    for (const subzone of subzones) {
      const subText = normalizeZoneText(subzone?.name);
      if (subText && (cityText === subText || cityText.includes(subText) || subText.includes(cityText))) {
        return zone.name;
      }
    }
  }
  return null;
};

export const isCityServed = (city, settings) => Boolean(findMatchingServiceZone(city, settings));

export const resolveDeliveryArea = (settings, city) => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  const fallbackFee = roundMoney(normalized.deliveryFee, DEFAULT_DELIVERY_FEE);
  const cityText = normalizeZoneText(city);
  if (!cityText) {
    return {
      available: false,
      zone: "",
      matchedName: "",
      fee: fallbackFee,
      reason: "missing_city",
    };
  }

  for (const zone of normalized.serviceZoneFees || []) {
    const zoneText = normalizeZoneText(zone?.name);
    if (zoneText && (cityText === zoneText || cityText.includes(zoneText) || zoneText.includes(cityText))) {
      return {
        available: true,
        zone: zone.name,
        matchedName: zone.name,
        fee: roundMoney(zone?.fee, fallbackFee),
        reason: "",
      };
    }
    const subzones = Array.isArray(zone?.subzones) ? zone.subzones : [];
    for (const subzone of subzones) {
      const subText = normalizeZoneText(subzone?.name);
      if (subText && (cityText === subText || cityText.includes(subText) || subText.includes(cityText))) {
        return {
          available: true,
          zone: zone.name,
          matchedName: subzone.name,
          fee: roundMoney(subzone?.fee, roundMoney(zone?.fee, fallbackFee)),
          reason: "",
        };
      }
    }
  }

  return {
    available: false,
    zone: "",
    matchedName: "",
    fee: null,
    reason: "unsupported_city",
  };
};

export const isSameDayAvailableNow = (settings, date = new Date()) => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  if (!normalized.sameDayEnabled) return false;
  const cutoffMinutes = getCutoffMinutes(normalized.sameDayCutoffTime);
  const nowParts = getLagosTimeParts(date);
  return nowParts.hour * 60 + nowParts.minute < cutoffMinutes;
};

export const buildSameDayDeliveryNotice = (settings, { useStoredNotice = true } = {}) => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  if (useStoredNotice && normalized.sameDayNotice) return normalized.sameDayNotice;
  if (!normalized.sameDayEnabled) return "Same-day delivery is currently unavailable.";
  return `Orders placed before ${formatDeliveryCutoffLabel(normalized.sameDayCutoffTime)} within ${formatServiceZonesLabel(normalized)} qualify for same-day delivery.`;
};

export const getDeliveryFeeForCity = (settings, city) => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  const fallbackFee = roundMoney(normalized.deliveryFee, DEFAULT_DELIVERY_FEE);
  const resolved = resolveDeliveryArea(normalized, city);
  return resolved.available ? resolved.fee : fallbackFee;
};

export const getServiceZoneFeeRange = (settings) => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  const values = [];
  (normalized.serviceZoneFees || []).forEach((zone) => {
    if (Number.isFinite(Number(zone?.fee))) values.push(Number(zone.fee));
    (Array.isArray(zone?.subzones) ? zone.subzones : []).forEach((subzone) => {
      if (Number.isFinite(Number(subzone?.fee))) values.push(Number(subzone.fee));
    });
  });
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max };
};

export const getDeliverySummaryConfig = (settings, city = "") => {
  const normalized = normalizeDeliverySettingsRecord(settings);
  return {
    freeDeliveryThreshold: normalized.freeDeliveryThreshold,
    deliveryFee: getDeliveryFeeForCity(normalized, city),
  };
};
