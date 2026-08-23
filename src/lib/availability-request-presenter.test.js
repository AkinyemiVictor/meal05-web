import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAvailabilityItemPresentation,
  getAvailabilityRequestPresentation,
  isAvailabilityRequestLive,
} from "./availability-request-presenter.js";

const now = new Date("2026-08-23T12:00:00.000Z");

const makeRequest = (overrides = {}) => ({
  status: "pending",
  confirmation_deadline_at: "2026-08-23T13:00:00.000Z",
  payment_expires_at: null,
  ...overrides,
});

test("customer presentation translates backend request phases", () => {
  assert.equal(getAvailabilityRequestPresentation(makeRequest(), now).label, "Checking availability");
  assert.equal(
    getAvailabilityRequestPresentation(
      makeRequest({ confirmation_deadline_at: "2026-08-23T11:00:00.000Z" }),
      now
    ).label,
    "Taking longer than expected"
  );
  assert.equal(getAvailabilityRequestPresentation(makeRequest({ status: "action_required" }), now).label, "Action needed");
  assert.equal(
    getAvailabilityRequestPresentation(
      makeRequest({ status: "confirmed", payment_expires_at: "2026-08-23T13:00:00.000Z" }),
      now
    ).label,
    "Ready for payment"
  );
  assert.equal(getAvailabilityRequestPresentation(makeRequest({ status: "converted" }), now).label, "Order created");
});

test("progress keeps request, availability and payment as separate stages", () => {
  const checking = getAvailabilityRequestPresentation(makeRequest(), now);
  assert.deepEqual(checking.progress.map((step) => step.state), ["complete", "active", "pending"]);

  const payable = getAvailabilityRequestPresentation(
    makeRequest({ status: "confirmed", payment_expires_at: "2026-08-23T13:00:00.000Z" }),
    now
  );
  assert.deepEqual(payable.progress.map((step) => step.state), ["complete", "complete", "active"]);

  const converted = getAvailabilityRequestPresentation(makeRequest({ status: "converted" }), now);
  assert.deepEqual(converted.progress.map((step) => step.state), ["complete", "complete", "complete"]);
});

test("item resolutions use customer language", () => {
  assert.equal(getAvailabilityItemPresentation({ resolution_status: "not_required" }).label, "Ready");
  assert.equal(getAvailabilityItemPresentation({ resolution_status: "pending" }).label, "Checking");
  assert.equal(getAvailabilityItemPresentation({ resolution_status: "confirmed" }).label, "Confirmed");
  assert.equal(getAvailabilityItemPresentation({ resolution_status: "unavailable" }).label, "Unavailable");
});

test("only terminal database states stop live refresh", () => {
  assert.equal(isAvailabilityRequestLive({ status: "pending" }), true);
  assert.equal(isAvailabilityRequestLive({ status: "checking" }), true);
  assert.equal(isAvailabilityRequestLive({ status: "action_required" }), true);
  assert.equal(isAvailabilityRequestLive({ status: "confirmed" }), true);
  assert.equal(isAvailabilityRequestLive({ status: "converted" }), false);
  assert.equal(isAvailabilityRequestLive({ status: "cancelled" }), false);
  assert.equal(isAvailabilityRequestLive({ status: "expired" }), false);
});
