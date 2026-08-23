import {
  DEFAULT_AVAILABILITY_SETTINGS,
  normalizeAvailabilitySettingsRecord,
  parseBusinessTime,
} from "./availability-settings.js";

const zonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

const localStamp = (parts, hour, minute) =>
  Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(minute),
    0
  );

const zonedWallTimeToDate = (parts, hour, minute, timeZone) => {
  const target = localStamp(parts, hour, minute);
  let guess = new Date(target);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(guess, timeZone);
    const actualStamp = localStamp(actual, Number(actual.hour), Number(actual.minute));
    const delta = target - actualStamp;
    if (Math.abs(delta) < 1000) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
};

const shiftLocalDate = (parts, days) => {
  const shifted = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days, 12, 0, 0)
  );
  return {
    year: String(shifted.getUTCFullYear()),
    month: String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    day: String(shifted.getUTCDate()).padStart(2, "0"),
  };
};

const buildTimingSettings = (settings = DEFAULT_AVAILABILITY_SETTINGS) => {
  const normalized = normalizeAvailabilitySettingsRecord(settings);
  const opens = parseBusinessTime(normalized.businessOpens, DEFAULT_AVAILABILITY_SETTINGS.businessOpens);
  const closes = parseBusinessTime(normalized.businessCloses, DEFAULT_AVAILABILITY_SETTINGS.businessCloses);
  return {
    ...normalized,
    opensAtHour: opens.hour,
    opensAtMinute: opens.minute,
    closesAtHour: closes.hour,
    closesAtMinute: closes.minute,
  };
};

const nextBusinessOpening = (date, settings) => {
  let cursor = new Date(date);

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const parts = zonedParts(cursor, settings.timeZone);
    const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    const opening = zonedWallTimeToDate(
      parts,
      settings.opensAtHour,
      settings.opensAtMinute,
      settings.timeZone
    );
    const closing = zonedWallTimeToDate(
      parts,
      settings.closesAtHour,
      settings.closesAtMinute,
      settings.timeZone
    );

    if (!weekend && cursor < opening) return opening;
    if (!weekend && cursor < closing) return cursor;

    const nextDateParts = shiftLocalDate(parts, 1);
    cursor = zonedWallTimeToDate(
      nextDateParts,
      settings.opensAtHour,
      settings.opensAtMinute,
      settings.timeZone
    );
  }

  return cursor;
};

export const addBusinessMinutes = (start, minutes, availabilitySettings = DEFAULT_AVAILABILITY_SETTINGS) => {
  const settings = buildTimingSettings(availabilitySettings);
  let cursor = nextBusinessOpening(new Date(start), settings);
  let remaining = Math.max(0, Number(minutes) || 0);

  while (remaining > 0) {
    const parts = zonedParts(cursor, settings.timeZone);
    const close = zonedWallTimeToDate(
      parts,
      settings.closesAtHour,
      settings.closesAtMinute,
      settings.timeZone
    );
    const available = Math.max(0, Math.floor((close.getTime() - cursor.getTime()) / 60000));

    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60000);
    }

    remaining -= available;
    cursor = nextBusinessOpening(new Date(close.getTime() + 60000), settings);
  }

  return cursor;
};

export const getAvailabilityDeadlines = (now = new Date(), availabilitySettings = DEFAULT_AVAILABILITY_SETTINGS) => {
  const settings = buildTimingSettings(availabilitySettings);
  return {
    confirmationDeadline: addBusinessMinutes(now, settings.confirmationSlaMinutes, settings),
    paymentWindowMinutes: settings.paymentWindowMinutes,
  };
};

export const availabilityDefaults = DEFAULT_AVAILABILITY_SETTINGS;
