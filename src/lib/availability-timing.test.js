import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAvailabilityDuration,
  normalizeAvailabilitySettingsRecord,
} from "./availability-settings.js";
import { getAvailabilityDeadlines } from "./availability-hours.js";

test("normalizes database availability settings", () => {
  const settings = normalizeAvailabilitySettingsRecord({
    timezone: "Africa/Lagos",
    business_opens: "08:30:00",
    business_closes: "17:45:00",
    confirmation_sla_minutes: 45,
    payment_window_minutes: 90,
  });
  assert.deepEqual(settings, {
    timeZone: "Africa/Lagos",
    businessOpens: "08:30",
    businessCloses: "17:45",
    confirmationSlaMinutes: 45,
    paymentWindowMinutes: 90,
  });
  assert.equal(formatAvailabilityDuration(settings.confirmationSlaMinutes), "45 minutes");
  assert.equal(formatAvailabilityDuration(settings.paymentWindowMinutes), "1h 30m");
});

test("carries confirmation time into the next business day", () => {
  const settings = normalizeAvailabilitySettingsRecord({
    timezone: "Africa/Lagos",
    business_opens: "08:00:00",
    business_closes: "18:00:00",
    confirmation_sla_minutes: 120,
    payment_window_minutes: 75,
  });
  const result = getAvailabilityDeadlines(new Date("2026-08-24T16:30:00.000Z"), settings);
  assert.equal(result.confirmationDeadline.toISOString(), "2026-08-25T08:30:00.000Z");
  assert.equal(result.paymentWindowMinutes, 75);
});

test("skips weekends for confirmation deadlines", () => {
  const settings = normalizeAvailabilitySettingsRecord({
    timezone: "Africa/Lagos",
    business_opens: "08:00:00",
    business_closes: "18:00:00",
    confirmation_sla_minutes: 120,
    payment_window_minutes: 120,
  });
  const result = getAvailabilityDeadlines(new Date("2026-08-28T16:30:00.000Z"), settings);
  assert.equal(result.confirmationDeadline.toISOString(), "2026-08-31T08:30:00.000Z");
});
