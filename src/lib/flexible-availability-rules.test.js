import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeCartItem } from "./cart-items.js";
import {
  isRequestOnlyItem,
  normalizeSizePreference,
  SELECTION_MODE_EXACT,
  SELECTION_MODE_FLEXIBLE,
  usesTrackedInventory,
} from "./commerce-options.js";

test("cart normalization preserves a flexible size preference from canonical snake-case data", () => {
  const item = normalizeCartItem({
    id: 91,
    product_id: 1,
    variant_id: 2,
    quantity: 1,
    unit_price_at_add: 1000,
    product_name: "Fresh produce",
    variant_name: "1 unit",
    selection_model: SELECTION_MODE_FLEXIBLE,
    size_preference: "larger",
  });

  assert.equal(item.selectionModel, SELECTION_MODE_FLEXIBLE);
  assert.equal(item.sizePreference, "larger");
});

test("flexible preference defaults independently of availability mode", () => {
  assert.equal(normalizeSizePreference(null, SELECTION_MODE_FLEXIBLE), "best_available");
  assert.equal(normalizeSizePreference("medium", SELECTION_MODE_FLEXIBLE), "medium");
  assert.equal(normalizeSizePreference("larger", SELECTION_MODE_EXACT), null);

  assert.equal(isRequestOnlyItem({ availability_mode: "standard", selection_model: SELECTION_MODE_FLEXIBLE }), false);
  assert.equal(isRequestOnlyItem({ availability_mode: "request", selection_model: SELECTION_MODE_FLEXIBLE }), true);
});

test("supplier inventory bypass is independent of request availability", () => {
  assert.equal(usesTrackedInventory({ inventory_tracking_mode: "tracked", availability_mode: "standard" }), true);
  assert.equal(usesTrackedInventory({ inventory_tracking_mode: "supplier", availability_mode: "standard" }), false);
  assert.equal(usesTrackedInventory({ inventory_tracking_mode: "tracked", availability_mode: "request" }), true);
  assert.equal(usesTrackedInventory({ inventory_tracking_mode: "supplier", availability_mode: "request" }), false);
});
