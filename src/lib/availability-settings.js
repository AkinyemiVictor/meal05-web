export const DEFAULT_AVAILABILITY_SETTINGS = Object.freeze({
  timeZone: "Africa/Lagos",
  businessOpens: "08:00",
  businessCloses: "18:00",
  confirmationSlaMinutes: 120,
  paymentWindowMinutes: 120,
});

const normalizePositiveInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
};

const normalizeTime = (value, fallback) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const parseBusinessTime = (value, fallback = "00:00") => {
  const normalized = normalizeTime(value, fallback);
  const [hour, minute] = normalized.split(":").map(Number);
  return { hour, minute };
};

export const normalizeAvailabilitySettingsRecord = (record = {}) => {
  const defaults = DEFAULT_AVAILABILITY_SETTINGS;
  const timeZone = String(record.timeZone ?? record.timezone ?? defaults.timeZone).trim() || defaults.timeZone;
  const businessOpens = normalizeTime(
    record.businessOpens ?? record.business_opens,
    defaults.businessOpens
  );
  const businessCloses = normalizeTime(
    record.businessCloses ?? record.business_closes,
    defaults.businessCloses
  );
  return {
    timeZone,
    businessOpens,
    businessCloses,
    confirmationSlaMinutes: normalizePositiveInteger(
      record.confirmationSlaMinutes ?? record.confirmation_sla_minutes,
      defaults.confirmationSlaMinutes
    ),
    paymentWindowMinutes: normalizePositiveInteger(
      record.paymentWindowMinutes ?? record.payment_window_minutes,
      defaults.paymentWindowMinutes
    ),
  };
};

export const formatAvailabilityDuration = (minutes) => {
  const total = normalizePositiveInteger(minutes, DEFAULT_AVAILABILITY_SETTINGS.confirmationSlaMinutes);
  if (total < 60) return `${total} minute${total === 1 ? "" : "s"}`;
  if (total % 60 === 0) {
    const hours = total / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return `${hours}h ${remainder}m`;
};

export const toPublicAvailabilityTiming = (settings = DEFAULT_AVAILABILITY_SETTINGS) => {
  const normalized = normalizeAvailabilitySettingsRecord(settings);
  return {
    timeZone: normalized.timeZone,
    businessOpens: normalized.businessOpens,
    businessCloses: normalized.businessCloses,
    confirmationSlaMinutes: normalized.confirmationSlaMinutes,
    paymentWindowMinutes: normalized.paymentWindowMinutes,
  };
};
