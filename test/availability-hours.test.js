import test from "node:test";
import assert from "node:assert/strict";
import { addBusinessMinutes } from "../src/lib/availability-hours.js";

test("adds the confirmation SLA inside Lagos business hours", () => {
  assert.equal(addBusinessMinutes(new Date("2026-08-20T09:00:00+01:00"), 120).toISOString(), "2026-08-20T10:00:00.000Z");
});

test("carries the SLA to the next business day", () => {
  assert.equal(addBusinessMinutes(new Date("2026-08-21T17:30:00+01:00"), 120).toISOString(), "2026-08-24T08:30:00.000Z");
});
