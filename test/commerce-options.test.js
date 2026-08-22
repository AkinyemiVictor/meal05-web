import test from "node:test";
import assert from "node:assert/strict";
import {
  isRequestOnlyItem,
  normalizeSizePreference,
  SELECTION_MODE_EXACT,
  SELECTION_MODE_FLEXIBLE,
  usesTrackedInventory,
} from "../src/lib/commerce-options.js";

test("exact variants reject physical-size preferences", () => {
  assert.equal(normalizeSizePreference("larger", SELECTION_MODE_EXACT), null);
});

test("flexible market products default to best available without changing the commercial variant", () => {
  assert.equal(normalizeSizePreference(undefined, SELECTION_MODE_FLEXIBLE), "best_available");
  assert.equal(normalizeSizePreference("larger", SELECTION_MODE_FLEXIBLE), "larger");
  assert.equal(normalizeSizePreference("malicious", SELECTION_MODE_FLEXIBLE), null);
});

test("availability confirmation and supplier inventory are independent flags", () => {
  assert.equal(isRequestOnlyItem({ availability_mode: "request", inventory_tracking_mode: "tracked" }), true);
  assert.equal(usesTrackedInventory({ availability_mode: "standard", inventory_tracking_mode: "supplier" }), false);
});

