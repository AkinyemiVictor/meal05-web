const DEFAULTS = Object.freeze({
  timeZone: "Africa/Lagos",
  opensAtHour: 8,
  closesAtHour: 18,
  confirmationMinutes: 120,
  paymentWindowMinutes: 120,
});

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

const lagosDate = (parts, hour, minute = 0) =>
  new Date(`${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`);

const nextBusinessOpening = (date, settings) => {
  let cursor = new Date(date);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const parts = zonedParts(cursor, settings.timeZone);
    const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    const opening = lagosDate(parts, settings.opensAtHour);
    const closing = lagosDate(parts, settings.closesAtHour);
    if (!weekend && cursor < opening) return opening;
    if (!weekend && cursor < closing) return cursor;
    cursor = new Date(lagosDate(parts, settings.opensAtHour).getTime() + 24 * 60 * 60 * 1000);
  }
  return cursor;
};

export const addBusinessMinutes = (start, minutes, overrides = {}) => {
  const settings = { ...DEFAULTS, ...overrides };
  let cursor = nextBusinessOpening(new Date(start), settings);
  let remaining = Math.max(0, Number(minutes) || 0);
  while (remaining > 0) {
    const parts = zonedParts(cursor, settings.timeZone);
    const close = lagosDate(parts, settings.closesAtHour);
    const available = Math.max(0, Math.floor((close.getTime() - cursor.getTime()) / 60000));
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60000);
    remaining -= available;
    cursor = nextBusinessOpening(new Date(close.getTime() + 60000), settings);
  }
  return cursor;
};

export const getAvailabilityDeadlines = (now = new Date(), overrides = {}) => {
  const settings = { ...DEFAULTS, ...overrides };
  const confirmationDeadline = addBusinessMinutes(now, settings.confirmationMinutes, settings);
  return {
    confirmationDeadline,
    paymentWindowMinutes: settings.paymentWindowMinutes,
  };
};

export const availabilityDefaults = DEFAULTS;
