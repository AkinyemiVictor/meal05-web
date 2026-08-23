import assert from "node:assert/strict";
import test from "node:test";
import { deriveAvailabilityRequestLifecycle } from "./availability-request-state.js";

const NOW = new Date("2026-08-23T10:00:00+01:00");

test("pending requests become overdue without changing their database status", () => {
  const lifecycle = deriveAvailabilityRequestLifecycle({
    status: "pending",
    confirmation_deadline_at: "2026-08-23T09:30:00+01:00",
  }, NOW);

  assert.equal(lifecycle.phase, "confirmation_overdue");
  assert.equal(lifecycle.confirmationSlaExceeded, true);
  assert.equal(lifecycle.paymentWindowExpired, false);
});

test("checking requests before the SLA remain active", () => {
  const lifecycle = deriveAvailabilityRequestLifecycle({
    status: "checking",
    confirmation_deadline_at: "2026-08-23T10:30:00+01:00",
  }, NOW);

  assert.equal(lifecycle.phase, "awaiting_confirmation");
  assert.equal(lifecycle.confirmationSlaExceeded, false);
});

test("action required is not treated as a confirmation SLA failure", () => {
  const lifecycle = deriveAvailabilityRequestLifecycle({
    status: "action_required",
    confirmation_deadline_at: "2026-08-23T09:00:00+01:00",
    payment_expires_at: "2026-08-23T09:15:00+01:00",
  }, NOW);

  assert.equal(lifecycle.phase, "action_required");
  assert.equal(lifecycle.confirmationSlaExceeded, false);
  assert.equal(lifecycle.paymentWindowExpired, false);
});

test("confirmed requests expose an expired payment window", () => {
  const lifecycle = deriveAvailabilityRequestLifecycle({
    status: "confirmed",
    payment_expires_at: "2026-08-23T09:59:00+01:00",
  }, NOW);

  assert.equal(lifecycle.phase, "payment_expired");
  assert.equal(lifecycle.paymentWindowExpired, true);
});

test("confirmed requests with no payment deadline are blocked as invalid state", () => {
  const lifecycle = deriveAvailabilityRequestLifecycle({ status: "confirmed" }, NOW);

  assert.equal(lifecycle.phase, "payment_deadline_missing");
  assert.equal(lifecycle.paymentDeadlineMissing, true);
  assert.equal(lifecycle.paymentWindowExpired, false);
});

test("terminal states remain terminal", () => {
  for (const status of ["converted", "cancelled", "expired"]) {
    const lifecycle = deriveAvailabilityRequestLifecycle({ status }, NOW);
    assert.equal(lifecycle.phase, status);
    assert.equal(lifecycle.isTerminal, true);
  }
});
